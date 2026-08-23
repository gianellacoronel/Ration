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
  createEphemeralSandbox,
  lifecycleGasReserve,
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
  if (args.length < 5 || args[0] !== 'run' || args[1] !== '--budget' ||
    !args[2] || args[2].startsWith('--') || args[3] !== '--' || !args[4]) return null

  const budget = parseUsdt(args[2])
  if (budget === null) return null
  return { budgetText: args[2], budget, command: args[4], commandArgs: args.slice(5) }
}

export async function runCommand (args, options, output) {
  const input = parseRunArgs(args)
  if (!input) {
    output.error('Usage: ration run --budget <amount> -- <command> [args...]')
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
  let sandbox
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

  try {
    sandbox = await createSandbox(standard.walletConfig)
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
    const gasReserve = lifecycleGasReserve(
      estimatedSweepFee,
      lifecycleGas.nativeFee,
      MAX_DEMO_RESOURCE_PURCHASES
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
        output.log('  Submitting Sepolia ETH gas reserve...')
        const gasFunding = await transfer({ ...gasInput, dryRun: false })
        receipt.fundingTransactions.eth.transactionHash = gasFunding.txHash ?? null
        receipt.fundingTransactions.eth.status = 'broadcast'
        gasConfirmed = await withProgress(output, 'Waiting for gas confirmation on Sepolia',
          () => awaitGas(sandbox, gasReserve, { signal: options.signal }))
        receipt.fundingTransactions.eth.status = 'confirmed_by_balance'
        receipt.fundingTransactions.eth.confirmedAt = session.now()
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
        output.log(`  Submitting ${formatUsdtBaseUnits(input.budget)} budget...`)
        const budgetFunding = await transfer({ ...budgetInput, dryRun: false })
        receipt.fundingTransactions.usdt.transactionHash = budgetFunding.txHash ?? null
        receipt.fundingTransactions.usdt.status = 'broadcast'
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
          output.log('  Budget confirmed.')
          throwIfInterrupted(options.signal)
          output.log('Ration')
          output.log('')
          output.log(`Sandbox   ${sandbox.address}`)
          output.log(`Budget    ${formatUsdtBaseUnits(initialUsdt)}`)
          output.log('Gas       Sepolia ETH infrastructure reserve')
          mcp = await sandbox.openMcp({ ...(options.mcpOptions ?? {}), session })
          receipt.cleanup.mcpStatus = 'open'
          output.log('Access    Ration MCP (catalog, purchase, balances, Sepolia USDT transfer)')
          output.log('')
          output.log(`Starting ${input.command}...`)
          commandAttempted = true
          receipt.childCommand.status = 'running'
          const launch = mcp.configureLaunch(input.command, input.commandArgs)
          const result = await execute(launch.command, launch.args, { env: launch.env })
          receipt.childCommand.exitCode = result.code ?? null
          receipt.childCommand.signal = result.signal ?? null
          receipt.childCommand.status = 'exited'
          exitCode = childExitCode(result)
        }
      }
    }
  } catch (error) {
    exitCode = operationExitCode(error)
    if (receipt.childCommand.status === 'running') receipt.childCommand.status = 'launch_or_runtime_failed'
    if (error instanceof CommandLaunchError) output.error(error.message)
    else if (error instanceof WalletTransferError || error instanceof WdkCliUnavailableError) {
      transferFailureMessage(error, input.budgetText, fundingAsset, output)
    } else if (!sandbox) {
      output.error('Could not create the in-memory WDK EOA sandbox.')
    } else {
      printWalletError(error, output, treasuryOpen ? 'Treasury' : 'Sandbox')
    }
  } finally {
    if (commandAttempted) {
      output.log('')
      output.log('Closing session')
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
        exitCode = 1
      }
    }

    if (sandbox && budgetSubmitted) {
      try {
        finalUsdt = await sandbox.getUsdtBalance()
        if (finalUsdt > 0n) {
          const sweep = commandAttempted
            ? await withProgress(output,
                `Returning ${formatUsdtBaseUnits(finalUsdt)} and waiting for confirmation`,
                () => sandbox.sweepUsdt(treasuryAddress))
            : await sandbox.sweepUsdt(treasuryAddress)
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
          receipt.finalSandboxUsdtBalanceBaseUnits = sweep.remaining?.toString() ?? null
          if (returnedUsdt === 0n || (sweep.remaining ?? 0n) > 0n) {
            output.error(`The remaining ${formatUsdtBaseUnits(finalUsdt)} could not be swept to the treasury.`)
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
        session.recordCleanupError('usdt_return', 'The sandbox USDT remainder could not be returned.')
        output.error('Security cleanup failed: the sandbox USD₮ remainder could not be swept to the treasury.')
        exitCode = 1
      }
    }

    if (sandbox && gasSubmitted) {
      try {
        const sweep = commandAttempted
          ? await withProgress(output,
              'Returning unused Sepolia ETH and waiting for confirmation',
              () => sandbox.sweepEth(treasuryAddress))
          : await sandbox.sweepEth(treasuryAddress)
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
          receipt.finalSandboxEthBalanceWei = partial.remaining?.toString() ?? null
        }
        session.recordCleanupError('eth_return', 'Recoverable sandbox ETH could not be returned.')
        output.error('Security cleanup failed: recoverable sandbox ETH could not be returned to the treasury.')
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
        exitCode = 1
      }
    }

    if (!sandbox && receipt.sandboxDisposalStatus === 'pending') {
      receipt.sandboxDisposalStatus = 'not_created'
    }
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
      exitCode = 1
    }
  }

  return exitCode
}
