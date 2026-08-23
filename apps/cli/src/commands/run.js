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
  let sandboxDisposed = false
  let mcp

  try {
    sandbox = await createSandbox(standard.walletConfig)
    const treasury = wallets.find((wallet) => wallet.name === TREASURY_NAME)
    if (!treasury.unlocked) await unlock(TREASURY_NAME)
    treasuryOpen = true
    treasuryAddress = (await getAddress(TREASURY_NAME, NETWORK)).address

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
        output.log('  Submitting Sepolia ETH gas reserve...')
        await transfer({ ...gasInput, dryRun: false })
        gasConfirmed = await withProgress(output, 'Waiting for gas confirmation on Sepolia',
          () => awaitGas(sandbox, gasReserve, { signal: options.signal }))
        output.log('  Gas reserve confirmed.')
        throwIfInterrupted(options.signal)

        fundingAsset = 'USDT'
        budgetSubmitted = true
        output.log(`  Submitting ${formatUsdtBaseUnits(input.budget)} budget...`)
        await transfer({ ...budgetInput, dryRun: false })
        output.log('  Budget transaction submitted.')
        if (!(await lockWallets(new Set([TREASURY_NAME]), options, output))) {
          exitCode = 1
        } else {
          treasuryOpen = false
          initialUsdt = await withProgress(output, 'Waiting for budget confirmation on Sepolia',
            () => awaitFunding(sandbox, input.budget, { signal: options.signal }))
          output.log('  Budget confirmed.')
          throwIfInterrupted(options.signal)
          output.log('Ration')
          output.log('')
          output.log(`Sandbox   ${sandbox.address}`)
          output.log(`Budget    ${formatUsdtBaseUnits(initialUsdt)}`)
          output.log('Gas       Sepolia ETH infrastructure reserve')
          mcp = await sandbox.openMcp(options.mcpOptions)
          output.log('Access    Ration MCP (catalog, purchase, balances, Sepolia USDT transfer)')
          output.log('')
          output.log(`Starting ${input.command}...`)
          commandAttempted = true
          const launch = mcp.configureLaunch(input.command, input.commandArgs)
          const result = await execute(launch.command, launch.args, { env: launch.env })
          exitCode = childExitCode(result)
        }
      }
    }
  } catch (error) {
    exitCode = operationExitCode(error)
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
        if (!(await lockWallets(new Set([TREASURY_NAME]), options, output))) exitCode = 1
      } catch {
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
        if (commandAttempted) output.log('  Agent access closed.')
      } catch {
        output.error('Security cleanup failed: the sandbox MCP server could not be closed.')
        exitCode = 1
      }
    }

    if (sandbox && gasSubmitted && gasConfirmed === undefined) {
      try {
        gasConfirmed = await awaitGas(sandbox, 1n)
      } catch {
        output.error('Security cleanup failed: submitted sandbox gas could not be located for recovery.')
        exitCode = 1
      }
    }

    if (sandbox && budgetSubmitted && initialUsdt === undefined) {
      try {
        initialUsdt = await awaitFunding(sandbox, input.budget)
      } catch {
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
          if (returnedUsdt === 0n || (sweep.remaining ?? 0n) > 0n) {
            output.error(`The remaining ${formatUsdtBaseUnits(finalUsdt)} could not be swept to the treasury.`)
            exitCode = 1
          } else if (commandAttempted) {
            output.log('  Remaining USDT returned.')
          }
        } else if (commandAttempted) {
          output.log('  No USDT remained to return.')
        }
      } catch {
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
        if (commandAttempted) output.log('  Sepolia ETH recovery complete.')
      } catch {
        output.error('Security cleanup failed: recoverable sandbox ETH could not be returned to the treasury.')
        exitCode = 1
      }
    }

    if (sandbox) {
      try {
        sandbox.dispose()
        sandboxDisposed = true
        if (commandAttempted) output.log('  Sandbox disposed.')
      } catch {
        output.error('Security cleanup failed: the ephemeral WDK sandbox could not be disposed.')
        exitCode = 1
      }
    }

    if (commandAttempted) {
      output.log('')
      output.log('Session complete')
      output.log('')
      if (finalUsdt === undefined) {
        output.log('Spent      unavailable')
        output.log('Returned   unavailable')
      } else {
        const spent = initialUsdt >= finalUsdt ? initialUsdt - finalUsdt : 0n
        output.log(`Spent      ${formatUsdtBaseUnits(spent)}`)
        output.log(`Returned   ${formatUsdtBaseUnits(returnedUsdt)}`)
      }
      if (returnedEth > 0n) output.log(`Gas back   ${formatEthBaseUnits(returnedEth)}`)
      output.log(`Sandbox    ${sandboxDisposed ? 'disposed' : 'disposal failed'}`)
    }
  }

  return exitCode
}
