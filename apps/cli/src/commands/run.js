import { NETWORK, SETUP_REQUIRED, TOKEN, TREASURY_NAME } from '../config.js'
import {
  balanceBaseUnits,
  feeBaseUnits,
  formatEthBaseUnits,
  formatUsdtBaseUnits,
  isTreasuryConfigured,
  nativeBalanceBaseUnits,
  parseUsdt
} from '../domain.js'
import { MAX_DEMO_RESOURCE_PURCHASES } from '../demo.js'
import { CommandLaunchError, WalletTransferError, WdkCliUnavailableError } from '../errors.js'
import { childExitCode, runRequestedCommand } from '../processes.js'
import { confirmTransfer } from '../prompts.js'
import {
  acquireSessionLease,
  createSessionJournal,
  persistSessionJournal,
  prepareRecoverySession,
  SecureCredentialStoreError,
  transitionSessionJournal
} from '../recovery.js'
import {
  createEphemeralSandbox,
  hierarchicalGasReserve,
  waitForSandboxFunding,
  waitForSandboxGas
} from '../sandbox.js'
import {
  createSessionReceipt,
  finalizeSessionReceipt,
  persistSessionReceipt,
  renderSessionSummary,
  shortSessionId
} from '../session.js'
import {
  runWdkGetAddress,
  runWdkGetEthBalance,
  runWdkGetUsdtBalance,
  runWdkTransfer,
  runWdkWalletUnlock
} from '../wdk.js'
import {
  loadWallets,
  lockWallets,
  operationExitCode,
  printWalletError,
  requireStandardSepolia,
  throwIfInterrupted,
  transferFailureMessage
} from './shared.js'

const PROGRESS_UPDATE_MS = 10000
const TTL_WARNING_THRESHOLDS = [120000, 30000]
const MAX_TIMER_DURATION_MS = 2147483647

function parseDuration (value) {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value ?? '')
  if (!match) return null
  const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000 }
  const duration = Number(match[1]) * multipliers[match[2]]
  return Number.isSafeInteger(duration) && duration > 0 && duration <= MAX_TIMER_DURATION_MS
    ? duration
    : null
}

function startFinancialTtl (ttlMs, output, options = {}, onExpire) {
  if (ttlMs === null) return null
  const setTimer = options.setTimeoutImpl ?? setTimeout
  const clearTimer = options.clearTimeoutImpl ?? clearTimeout
  const timers = []
  let hasExpired = false
  let expire
  const expired = new Promise((resolve) => { expire = resolve })
  for (const remaining of TTL_WARNING_THRESHOLDS) {
    if (ttlMs <= remaining) continue
    const timer = setTimer(() => {
      output.error(`Warning: Ration financial session expires in ${remaining === 120000 ? '2m' : '30s'}.`)
    }, ttlMs - remaining)
    timer.unref?.()
    timers.push(timer)
  }
  timers.push(setTimer(() => {
    hasExpired = true
    try { onExpire?.() } catch {}
    expire()
  }, ttlMs))
  return {
    expired,
    get hasExpired () { return hasExpired },
    cancel () {
      for (const timer of timers) clearTimer(timer)
    }
  }
}

async function withProgress (output, label, operation) {
  const startedAt = Date.now()
  output.log(`  ${label}...`)
  const timer = setInterval(() => {
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    output.log(`  Still ${label.toLowerCase()} (${seconds}s elapsed)...`)
  }, PROGRESS_UPDATE_MS)
  timer.unref?.()
  try {
    return await operation()
  } finally {
    clearInterval(timer)
  }
}

function parseRunArgs (args) {
  if (args[0] !== 'run') return null
  const separator = args.indexOf('--')
  if (separator < 3 || !args[separator + 1]) return null
  let budgetText
  let ttlMs = null
  let hardTtl = false
  for (let index = 1; index < separator; index++) {
    const option = args[index]
    if (option === '--hard-ttl') {
      hardTtl = true
      continue
    }
    if ((option === '--budget' || option === '--ttl') && args[index + 1] &&
      !args[index + 1].startsWith('--')) {
      if (option === '--budget' && budgetText === undefined) budgetText = args[++index]
      else if (option === '--ttl' && ttlMs === null) ttlMs = parseDuration(args[++index])
      else return null
      if (option === '--ttl' && ttlMs === null) return null
      continue
    }
    return null
  }
  if (budgetText === undefined || (hardTtl && ttlMs === null)) return null
  const budget = parseUsdt(budgetText)
  if (budget === null) return null
  return {
    budgetText,
    budget,
    ttlMs,
    hardTtl,
    command: args[separator + 1],
    commandArgs: args.slice(separator + 2)
  }
}

export async function runCommand (args, options, output) {
  const input = parseRunArgs(args)
  if (!input) {
    output.error('Usage: ration run --budget <amount> [--ttl <duration>] [--hard-ttl] -- <command> [args...]')
    return 1
  }

  const wallets = await loadWallets(options, output)
  if (!wallets) return 1
  if (!isTreasuryConfigured(wallets)) {
    output.error(SETUP_REQUIRED)
    return 1
  }
  const standard = await requireStandardSepolia(options, output)
  if (!standard) return 1

  const createSandbox = options.createEphemeralSandbox ?? createEphemeralSandbox
  const awaitFunding = options.waitForSandboxFunding ?? waitForSandboxFunding
  const awaitGas = options.waitForSandboxGas ?? waitForSandboxGas
  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const getTreasuryUsdt = options.runWdkGetUsdtBalance ?? runWdkGetUsdtBalance
  const getTreasuryEth = options.runWdkGetEthBalance ?? runWdkGetEthBalance
  const transfer = options.runWdkTransfer ?? runWdkTransfer
  const confirm = options.confirmTransfer ?? (() => confirmTransfer({ signal: options.signal }))
  const execute = options.runRequestedCommand ?? runRequestedCommand
  const session = (options.createSessionReceipt ?? createSessionReceipt)({
    budgetBaseUnits: input.budget,
    command: input.command,
    commandArgs: input.commandArgs
  }, options)
  const receipt = session.receipt
  const persistReceipt = options.persistSessionReceipt ?? persistSessionReceipt
  const prepareRecovery = options.prepareRecoverySession ?? prepareRecoverySession
  const persistJournal = options.persistSessionJournal ?? persistSessionJournal
  let sandbox
  let recovery
  let releaseSessionLease
  let journal
  let treasuryAddress
  let initialUsdt
  let finalUsdt
  let returnedUsdt = 0n
  let returnedEth = 0n
  let commandAttempted = false
  let exitCode = 0
  let treasuryOpen = false
  let gasSubmitted = false
  let gasConfirmed
  let budgetSubmitted = false
  let fundingAsset = 'USDT'
  let mcp
  let financialTtl
  let mcpExpiration
  let financialExpired = false
  let recoveryRequired = false
  let journalWrite = Promise.resolve()

  const saveJournal = () => {
    if (!journal) return Promise.resolve()
    const snapshot = structuredClone(journal)
    const write = () => persistJournal(snapshot, recovery.journalKey, options)
    const result = journalWrite.then(write, write)
    journalWrite = result.catch(() => {})
    return result
  }
  const transitionJournal = async (state, update = {}) => {
    if (!journal) return
    transitionSessionJournal(journal, state, update, options)
    await saveJournal()
  }

  try {
    recovery = await prepareRecovery(receipt.sessionId, options)
    releaseSessionLease = await (options.acquireSessionLease ?? acquireSessionLease)(receipt.sessionId, options)
    sandbox = await createSandbox(standard.walletConfig, { seed: recovery.seed })
    receipt.sandboxAddress = sandbox.address
    const treasury = wallets.find((wallet) => wallet.name === TREASURY_NAME)
    if (!treasury.unlocked) await unlock(TREASURY_NAME)
    treasuryOpen = true
    treasuryAddress = (await getAddress(TREASURY_NAME, NETWORK)).address
    receipt.treasuryAddress = treasuryAddress

    const treasuryUsdt = balanceBaseUnits(await getTreasuryUsdt(TREASURY_NAME, NETWORK))
    const treasuryEth = nativeBalanceBaseUnits(await getTreasuryEth(TREASURY_NAME, NETWORK))
    const lifecycleGas = await sandbox.quoteLifecycleGas(treasuryAddress)
    const budgetInput = {
      sourceWallet: TREASURY_NAME,
      network: NETWORK,
      to: sandbox.address,
      amount: input.budgetText,
      expectedBaseUnits: input.budget,
      token: TOKEN,
      dryRun: true
    }
    const budgetPreview = await transfer(budgetInput)
    const budgetFundingFee = feeBaseUnits(budgetPreview)
    const estimatedSweepFee = budgetFundingFee === null
      ? lifecycleGas.tokenFee
      : [lifecycleGas.tokenFee, budgetFundingFee].reduce((largest, fee) => fee > largest ? fee : largest)
    const gasReserve = hierarchicalGasReserve(
      estimatedSweepFee,
      lifecycleGas.nativeFee,
      MAX_DEMO_RESOURCE_PURCHASES + 1
    )
    receipt.initialGasReserveWei = gasReserve.toString()
    const gasInput = {
      sourceWallet: TREASURY_NAME,
      network: NETWORK,
      to: sandbox.address,
      amount: gasReserve,
      expectedBaseUnits: gasReserve,
      baseUnits: true,
      dryRun: true
    }
    const gasPreview = await transfer(gasInput)
    const gasFundingFee = feeBaseUnits(gasPreview)

    journal = createSessionJournal({
      sessionId: receipt.sessionId,
      sandboxAddress: sandbox.address,
      treasuryAddress,
      budgetBaseUnits: input.budget,
      gasReserveWei: gasReserve,
      childCommand: receipt.childCommand
    }, options)
    await saveJournal()
    session.setActivityListener(() => {
      journal.activity = structuredClone(receipt.activity)
      journal.sandboxTree = structuredClone(receipt.sandboxTree)
      return saveJournal()
    })

    if (gasFundingFee === null || budgetFundingFee === null || gasReserve <= 0n) {
      output.error('WDK did not return a valid Sepolia ETH gas quote. Nothing was broadcast.')
      exitCode = 1
    } else {
      const requiredEth = gasReserve + gasFundingFee + budgetFundingFee
      output.log('Sandbox funding')
      output.log('')
      output.log(`Budget        ${formatUsdtBaseUnits(input.budget)}`)
      output.log(`Gas reserve   ${formatEthBaseUnits(gasReserve)} (infrastructure)`)
      output.log('')

      if (treasuryUsdt < input.budget) {
        output.error(`Insufficient treasury USD₮: available ${formatUsdtBaseUnits(treasuryUsdt)}, required ${formatUsdtBaseUnits(input.budget)}.`)
        output.error("Add test USD₮ to the treasury address shown by 'ration setup', then try again.")
        exitCode = 1
      } else if (treasuryEth < requiredEth) {
        output.error(`Insufficient treasury gas: available ${formatEthBaseUnits(treasuryEth)}, required ${formatEthBaseUnits(requiredEth)}.`)
        output.error("Add Sepolia ETH to the treasury address shown by 'ration setup', then try again.")
        exitCode = 1
      } else if (await confirm() !== true) {
        output.log('Session cancelled. Nothing was broadcast.')
      } else {
        output.log('')
        output.log('Funding sandbox')
        throwIfInterrupted(options.signal)
        fundingAsset = 'ETH'
        gasSubmitted = true
        receipt.fundingTransactions.eth = {
          amountWei: gasReserve.toString(),
          recipientAddress: sandbox.address,
          transactionHash: null,
          status: 'submission_unknown',
          submittedAt: session.now()
        }
        journal.transactions.funding.eth = { ...receipt.fundingTransactions.eth }
        await transitionJournal('funding')
        output.log('  Submitting Sepolia ETH gas reserve...')
        const gasFunding = await transfer({ ...gasInput, dryRun: false })
        receipt.fundingTransactions.eth.transactionHash = gasFunding.txHash ?? null
        receipt.fundingTransactions.eth.status = 'broadcast'
        Object.assign(journal.transactions.funding.eth, receipt.fundingTransactions.eth)
        await saveJournal()
        gasConfirmed = await withProgress(output, 'Waiting for gas confirmation on Sepolia',
          () => awaitGas(sandbox, gasReserve, { signal: options.signal }))
        receipt.fundingTransactions.eth.status = 'confirmed_by_balance'
        receipt.fundingTransactions.eth.confirmedAt = session.now()
        Object.assign(journal.transactions.funding.eth, receipt.fundingTransactions.eth)
        await saveJournal()
        output.log('  Gas reserve confirmed.')
        throwIfInterrupted(options.signal)

        fundingAsset = 'USDT'
        budgetSubmitted = true
        receipt.fundingTransactions.usdt = {
          amountBaseUnits: input.budget.toString(),
          recipientAddress: sandbox.address,
          transactionHash: null,
          status: 'submission_unknown',
          submittedAt: session.now()
        }
        journal.transactions.funding.usdt = { ...receipt.fundingTransactions.usdt }
        await saveJournal()
        output.log(`  Submitting ${formatUsdtBaseUnits(input.budget)} budget...`)
        const budgetFunding = await transfer({ ...budgetInput, dryRun: false })
        receipt.fundingTransactions.usdt.transactionHash = budgetFunding.txHash ?? null
        receipt.fundingTransactions.usdt.status = 'broadcast'
        Object.assign(journal.transactions.funding.usdt, receipt.fundingTransactions.usdt)
        await saveJournal()
        output.log('  Budget transaction submitted.')
        if (!(await lockWallets(new Set([TREASURY_NAME]), options, output))) {
          receipt.treasuryIsolation.finalStatus = 'lock_failed'
          exitCode = 1
        } else {
          treasuryOpen = false
          receipt.treasuryIsolation.lockedBeforeChild = true
          receipt.treasuryIsolation.finalStatus = 'locked'
          initialUsdt = await withProgress(output, 'Waiting for budget confirmation on Sepolia',
            () => awaitFunding(sandbox, input.budget, { signal: options.signal }))
          receipt.fundingTransactions.usdt.status = 'confirmed_by_balance'
          receipt.fundingTransactions.usdt.confirmedAt = session.now()
          Object.assign(journal.transactions.funding.usdt, receipt.fundingTransactions.usdt)
          const expiresAt = input.ttlMs === null
            ? null
            : new Date(Date.now() + input.ttlMs).toISOString()
          receipt.financialSession.ttlMs = input.ttlMs
          receipt.financialSession.hardTtl = input.hardTtl
          receipt.financialSession.expiresAt = expiresAt
          receipt.financialSession.status = 'funded'
          journal.lifecycle.expiresAt = expiresAt
          financialTtl = startFinancialTtl(input.ttlMs, output, options, () => {
            if (mcp) mcpExpiration ??= mcp.expire()
          })
          await transitionJournal('funded')
          output.log('  Budget confirmed.')
          throwIfInterrupted(options.signal)
          output.log('Ration')
          output.log('')
          output.log(`Sandbox   ${sandbox.address}`)
          output.log(`Budget    ${formatUsdtBaseUnits(initialUsdt)}`)
          output.log('Gas       Sepolia ETH infrastructure reserve')
          mcp = await sandbox.openMcp({
            ...(options.mcpOptions ?? {}),
            session,
            subagentCommand: input.command,
            subagentCommandArgs: input.commandArgs,
            runSubagentCommand: options.runSubagentCommand
          })
          if (financialTtl?.hasExpired) mcpExpiration ??= mcp.expire()
          receipt.cleanup.mcpStatus = 'open'
          output.log('Access    Ration MCP (catalog, purchase, balances, Sepolia USDT transfer)')
          output.log('')
          output.log(`Starting ${input.command}...`)
          commandAttempted = true
          receipt.childCommand.status = 'running'
          receipt.financialSession.status = 'running'
          await transitionJournal('running')
          const launch = mcp.configureLaunch(input.command, input.commandArgs)
          const childController = new AbortController()
          const childResult = Promise.resolve(execute(launch.command, launch.args, {
            env: launch.env,
            signal: childController.signal,
            signalGraceMs: options.hardTtlGraceMs ?? options.signalGraceMs ?? 1000
          })).then(
            (result) => ({ type: 'child', result }),
            (error) => { throw error }
          )
          const outcome = financialTtl
            ? await Promise.race([childResult, financialTtl.expired.then(() => ({ type: 'ttl' }))])
            : await childResult
          if (outcome.type === 'child') {
            financialTtl?.cancel()
            receipt.childCommand.exitCode = outcome.result.code ?? null
            receipt.childCommand.signal = outcome.result.signal ?? null
            receipt.childCommand.status = 'exited'
            exitCode = childExitCode(outcome.result)
          } else {
            financialExpired = true
            receipt.financialSession.status = 'expired'
            receipt.childCommand.status = input.hardTtl
              ? 'terminating_at_hard_ttl'
              : 'running_after_financial_expiry'
            output.error('Ration financial TTL expired. No further spending is allowed.')
            const expiration = mcpExpiration ?? mcp.expire()
            if (input.hardTtl) {
              childController.abort('SIGTERM')
              exitCode = 124
              let terminationTimer
              const termination = await Promise.race([
                childResult,
                new Promise((resolve) => {
                  terminationTimer = setTimeout(resolve,
                    (options.hardTtlGraceMs ?? options.signalGraceMs ?? 1000) +
                    (options.hardTtlKillWaitMs ?? 5000))
                })
              ])
              clearTimeout(terminationTimer)
              if (termination?.type === 'child') {
                receipt.childCommand.exitCode = termination.result.code ?? null
                receipt.childCommand.signal = termination.result.signal ?? null
                receipt.childCommand.status = 'terminated_at_hard_ttl'
              } else {
                receipt.childCommand.status = 'termination_unconfirmed_at_hard_ttl'
                output.error('Hard TTL could not confirm that the child process terminated.')
                exitCode = 1
              }
            }
            await expiration
            await transitionJournal('expired')
          }
        }
      }
    }
  } catch (error) {
    exitCode = operationExitCode(error)
    if (receipt.childCommand.status === 'running') receipt.childCommand.status = 'launch_or_runtime_failed'
    if (error instanceof CommandLaunchError) output.error(error.message)
    else if (error instanceof WalletTransferError || error instanceof WdkCliUnavailableError) {
      transferFailureMessage(error, input.budgetText, fundingAsset, output)
    } else if (error instanceof SecureCredentialStoreError) {
      output.error(error.message)
    } else if (!sandbox) {
      output.error('Could not create the in-memory WDK EOA sandbox.')
    } else {
      printWalletError(error, output, treasuryOpen ? 'Treasury' : 'Sandbox')
    }
  } finally {
    financialTtl?.cancel()
    if (commandAttempted) {
      output.log('')
      output.log('Closing session')
    }

    if (journal && (gasSubmitted || budgetSubmitted)) {
      try {
        await transitionJournal('sweeping')
      } catch {
        recoveryRequired = true
        output.error('Security cleanup warning: the recovery journal could not record the sweep state.')
        exitCode = 1
      }
    }

    if (treasuryOpen) {
      try {
        if (!(await lockWallets(new Set([TREASURY_NAME]), options, output))) {
          receipt.treasuryIsolation.finalStatus = 'lock_failed'
          exitCode = 1
        } else {
          treasuryOpen = false
          receipt.treasuryIsolation.finalStatus = 'locked'
        }
      } catch {
        receipt.treasuryIsolation.finalStatus = 'lock_failed'
        session.recordCleanupError('treasury_lock', 'The treasury could not be locked.')
        output.error('Security cleanup failed: the treasury could not be locked.')
        exitCode = 1
      }
    }

    if (mcp) {
      try {
        if (commandAttempted) {
          await withProgress(output, 'Revoking agent access and finishing in-flight payments',
            () => mcp.close())
        } else {
          await mcp.close()
        }
        receipt.cleanup.mcpStatus = 'closed'
        if (commandAttempted) output.log('  Agent access closed.')
      } catch {
        receipt.cleanup.mcpStatus = 'close_failed'
        session.recordCleanupError('mcp_close', 'The sandbox MCP server could not be closed.')
        output.error('Security cleanup failed: the sandbox MCP server could not be closed.')
        recoveryRequired = true
        exitCode = 1
      }
    }

    if (sandbox && gasSubmitted && gasConfirmed === undefined) {
      try {
        gasConfirmed = await awaitGas(sandbox, 1n)
        if (receipt.fundingTransactions.eth) {
          receipt.fundingTransactions.eth.status = 'located_during_cleanup'
          receipt.fundingTransactions.eth.confirmedAt = session.now()
        }
      } catch {
        session.recordCleanupError('gas_recovery', 'Submitted sandbox gas could not be located.')
        output.error('Security cleanup failed: submitted sandbox gas could not be located for recovery.')
        recoveryRequired = true
        exitCode = 1
      }
    }

    if (sandbox && budgetSubmitted && initialUsdt === undefined) {
      try {
        initialUsdt = await awaitFunding(sandbox, input.budget)
        if (receipt.fundingTransactions.usdt) {
          receipt.fundingTransactions.usdt.status = 'located_during_cleanup'
          receipt.fundingTransactions.usdt.confirmedAt = session.now()
        }
      } catch {
        session.recordCleanupError('budget_recovery', 'Submitted sandbox funding could not be located.')
        output.error('Security cleanup failed: submitted sandbox funding could not be located for sweeping.')
        recoveryRequired = true
        exitCode = 1
      }
    }

    if (sandbox && budgetSubmitted) {
      try {
        finalUsdt = await sandbox.getUsdtBalance()
        if (finalUsdt > 0n) {
          const sweepHooks = {
            onTransactions: async ([transaction]) => {
              journal.transactions.returns.usdt = {
                amountBaseUnits: transaction.status === 'confirmed' ? transaction.amount.toString() : '0',
                attemptedAmountBaseUnits: transaction.amount.toString(),
                recipientAddress: treasuryAddress,
                transactionHash: transaction.hash,
                feeWei: transaction.fee.toString(),
                remainingBaseUnits: null,
                status: transaction.status
              }
              await saveJournal()
            }
          }
          const sweep = commandAttempted
            ? await withProgress(output,
                `Returning ${formatUsdtBaseUnits(finalUsdt)} and waiting for confirmation`,
                () => sandbox.sweepUsdt(treasuryAddress, sweepHooks))
            : await sandbox.sweepUsdt(treasuryAddress, sweepHooks)
          returnedUsdt = sweep.amount
          receipt.usdtReturnedToTreasuryBaseUnits = returnedUsdt.toString()
          receipt.returnTransactions.usdt = {
            amountBaseUnits: returnedUsdt.toString(),
            recipientAddress: treasuryAddress,
            transactionHash: sweep.hash ?? sweep.transactions?.[0]?.hash ?? null,
            feeWei: sweep.fee?.toString() ?? null,
            remainingBaseUnits: sweep.remaining?.toString() ?? null,
            status: returnedUsdt > 0n && sweep.remaining === null
              ? 'confirmed_return_balance_unavailable'
              : returnedUsdt > 0n && (sweep.remaining ?? 0n) === 0n
                  ? 'confirmed'
                  : 'incomplete'
          }
          journal.transactions.returns.usdt = { ...receipt.returnTransactions.usdt }
          await saveJournal()
          receipt.finalSandboxUsdtBalanceBaseUnits = sweep.remaining?.toString() ?? null
          if (returnedUsdt === 0n || (sweep.remaining ?? 0n) > 0n) {
            output.error(`The remaining ${formatUsdtBaseUnits(finalUsdt)} could not be swept to the treasury.`)
            recoveryRequired = true
            exitCode = 1
          } else if (commandAttempted) {
            output.log('  Remaining USDT returned.')
          }
        } else {
          receipt.returnTransactions.usdt = {
            amountBaseUnits: '0',
            recipientAddress: treasuryAddress,
            transactionHash: null,
            feeWei: '0',
            remainingBaseUnits: '0',
            status: 'not_needed'
          }
          journal.transactions.returns.usdt = { ...receipt.returnTransactions.usdt }
          await saveJournal()
          receipt.finalSandboxUsdtBalanceBaseUnits = '0'
          if (commandAttempted) output.log('  No USDT remained to return.')
        }
      } catch (error) {
        const partial = error?.partialSweep
        const transaction = partial?.transactions?.[0]
        receipt.returnTransactions.usdt ??= {
          amountBaseUnits: partial?.amount?.toString() ?? '0',
          attemptedAmountBaseUnits: transaction?.amount?.toString() ?? finalUsdt?.toString() ?? null,
          recipientAddress: treasuryAddress,
          transactionHash: transaction?.hash ?? null,
          feeWei: transaction?.fee?.toString() ?? null,
          remainingBaseUnits: partial?.remaining?.toString() ?? null,
          status: transaction?.status ?? 'failed'
        }
        if (journal && partial) {
          journal.transactions.returns.usdt = { ...receipt.returnTransactions.usdt }
          try { await saveJournal() } catch {}
        }
        session.recordCleanupError('usdt_return', 'The sandbox USDT remainder could not be returned.')
        output.error('Security cleanup failed: the sandbox USD₮ remainder could not be swept to the treasury.')
        recoveryRequired = true
        exitCode = 1
      }
    }

    if (sandbox && gasSubmitted) {
      try {
        const sweepHooks = {
          onTransactions: async (transactions) => {
            journal.transactions.returns.eth = transactions.map((transaction) => ({
              amountWei: transaction.amount.toString(),
              recipientAddress: treasuryAddress,
              transactionHash: transaction.hash,
              feeWei: transaction.fee.toString(),
              status: transaction.status
            }))
            await saveJournal()
          }
        }
        const sweep = commandAttempted
          ? await withProgress(output,
              'Returning unused Sepolia ETH and waiting for confirmation',
              () => sandbox.sweepEth(treasuryAddress, sweepHooks))
          : await sandbox.sweepEth(treasuryAddress, sweepHooks)
        returnedEth = sweep.amount
        receipt.ethReturnedToTreasuryWei = returnedEth.toString()
        receipt.returnTransactions.eth = (sweep.transactions ?? (sweep.hash
          ? [{ hash: sweep.hash, amount: sweep.amount, fee: sweep.fee }]
          : [])).map((transaction) => ({
          amountWei: transaction.amount.toString(),
          recipientAddress: treasuryAddress,
          transactionHash: transaction.hash,
          feeWei: transaction.fee.toString(),
          status: transaction.status ?? 'confirmed'
        }))
        journal.transactions.returns.eth = receipt.returnTransactions.eth.map((transaction) => ({ ...transaction }))
        await saveJournal()
        receipt.finalSandboxEthBalanceWei = sweep.remaining?.toString() ?? null
        if (commandAttempted) output.log('  Sepolia ETH recovery complete.')
      } catch (error) {
        const partial = error?.partialSweep
        if (partial) {
          returnedEth = partial.amount
          receipt.ethReturnedToTreasuryWei = returnedEth.toString()
          receipt.returnTransactions.eth = partial.transactions.map((transaction) => ({
            amountWei: transaction.amount.toString(),
            recipientAddress: treasuryAddress,
            transactionHash: transaction.hash,
            feeWei: transaction.fee.toString(),
            status: transaction.status ?? 'confirmed'
          }))
          journal.transactions.returns.eth = receipt.returnTransactions.eth.map((transaction) => ({ ...transaction }))
          try { await saveJournal() } catch {}
          receipt.finalSandboxEthBalanceWei = partial.remaining?.toString() ?? null
        }
        session.recordCleanupError('eth_return', 'Recoverable sandbox ETH could not be returned.')
        output.error('Security cleanup failed: recoverable sandbox ETH could not be returned to the treasury.')
        recoveryRequired = true
        exitCode = 1
      }
    }

    if (sandbox) {
      try {
        sandbox.dispose()
        receipt.sandboxDisposalStatus = 'disposed'
        if (commandAttempted) output.log('  Sandbox disposed.')
      } catch {
        receipt.sandboxDisposalStatus = 'failed'
        session.recordCleanupError('sandbox_disposal', 'The ephemeral WDK sandbox could not be disposed.')
        output.error('Security cleanup failed: the ephemeral WDK sandbox could not be disposed.')
        recoveryRequired = true
        exitCode = 1
      }
    }

    if (!sandbox && receipt.sandboxDisposalStatus === 'pending') {
      receipt.sandboxDisposalStatus = 'not_created'
    }
    if (!financialExpired) receipt.financialSession.status = 'complete'
    const finalizedReceipt = finalizeSessionReceipt(session, {
      initialUsdtBalance: initialUsdt,
      finalUsdtBalance: finalUsdt,
      exitCode: options.signal?.aborted
        ? operationExitCode({ signal: options.signal.reason })
        : exitCode
    })
    if (commandAttempted) {
      output.log('')
      for (const line of renderSessionSummary(finalizedReceipt)) output.log(line)
    }
    try {
      await persistReceipt(finalizedReceipt, options)
      if (commandAttempted) output.log(`Session ID  ${shortSessionId(finalizedReceipt.sessionId)}`)
    } catch {
      output.error('The session record could not be persisted.')
      if (gasSubmitted || budgetSubmitted) recoveryRequired = true
      exitCode = 1
    }
    if (journal && !recoveryRequired) {
      try {
        await transitionJournal('complete')
      } catch {
        output.error('The completed recovery journal could not be finalized.')
        exitCode = 1
      }
    }
    try {
      await releaseSessionLease?.()
    } catch {
      output.error('The session recovery lease could not be released.')
      exitCode = 1
    }
    recovery?.seed.fill(0)
    recovery?.journalKey.fill(0)
  }

  return exitCode
}
