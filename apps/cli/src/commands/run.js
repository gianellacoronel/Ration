import { NETWORK, SETUP_REQUIRED, TREASURY_NAME } from '../config.js'
import { balanceBaseUnits, formatUsdtBaseUnits, isTreasuryConfigured, parseUsdt } from '../domain.js'
import { CommandLaunchError, WalletTransferError, WdkCliUnavailableError } from '../errors.js'
import { paymasterTokenFee } from '../paymaster.js'
import { childExitCode, runRequestedCommand } from '../processes.js'
import { confirmTransfer } from '../prompts.js'
import { createEphemeralSandbox, waitForSandboxFunding } from '../sandbox.js'
import {
  runWdkGetAddress,
  runWdkGetUsdtBalance,
  runWdkTransfer,
  runWdkWalletUnlock
} from '../wdk.js'
import {
  loadWallets,
  lockWallets,
  operationExitCode,
  printWalletError,
  requirePaymasterTokenMode,
  transferFailureMessage
} from './shared.js'

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
  const paymaster = await requirePaymasterTokenMode(options, output)
  if (!paymaster) return 1

  const createSandbox = options.createEphemeralSandbox ?? createEphemeralSandbox
  const awaitFunding = options.waitForSandboxFunding ?? waitForSandboxFunding
  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const getTreasuryBalance = options.runWdkGetUsdtBalance ?? runWdkGetUsdtBalance
  const transfer = options.runWdkTransfer ?? runWdkTransfer
  const confirm = options.confirmTransfer ?? confirmTransfer
  const execute = options.runRequestedCommand ?? runRequestedCommand
  let sandbox
  let treasuryAddress
  let initialBalance
  let finalBalance
  let swept = 0n
  let commandAttempted = false
  let exitCode = 0
  let treasuryOpen = false

  try {
    sandbox = await createSandbox(paymaster.walletConfig)
    const treasury = wallets.find((wallet) => wallet.name === TREASURY_NAME)
    if (!treasury.unlocked) {
      await unlock(TREASURY_NAME)
    }
    treasuryOpen = true
    treasuryAddress = (await getAddress(TREASURY_NAME, NETWORK)).address
    const treasuryBalance = balanceBaseUnits(await getTreasuryBalance(TREASURY_NAME, NETWORK))
    const transferInput = {
      sourceWallet: TREASURY_NAME,
      network: NETWORK,
      to: sandbox.address,
      amount: input.budgetText,
      dryRun: true
    }
    const preview = await transfer(transferInput)
    const fee = paymasterTokenFee(preview)
    if (fee === null) {
      output.error('WDK did not return a valid USD₮ gas quote. Nothing was broadcast.')
      exitCode = 1
    } else if (fee >= paymaster.transferMaxFee) {
      output.error(`The estimated network fee ${formatUsdtBaseUnits(fee)} exceeds the WDK safety limit of ${formatUsdtBaseUnits(paymaster.transferMaxFee)}.`)
      output.error('Nothing was broadcast.')
      exitCode = 1
    } else {
      const total = input.budget + fee
      output.log('Sandbox funding')
      output.log('')
      output.log(`Budget       ${formatUsdtBaseUnits(input.budget)}`)
      output.log(`Network fee  ${formatUsdtBaseUnits(fee)}`)
      output.log(`Total        ${formatUsdtBaseUnits(total)}`)
      output.log('')

      if (treasuryBalance < total) {
        output.error(`Insufficient treasury funds: available ${formatUsdtBaseUnits(treasuryBalance)}, required ${formatUsdtBaseUnits(total)}.`)
        output.error("Add USD₮ to the treasury address shown by 'ration setup', then try again.")
        exitCode = 1
      } else if (await confirm() !== true) {
        output.log('Session cancelled. Nothing was broadcast.')
      } else {
        await transfer({ ...transferInput, dryRun: false })
        if (!(await lockWallets(new Set([TREASURY_NAME]), options, output))) {
          exitCode = 1
        } else {
          treasuryOpen = false
          initialBalance = await awaitFunding(sandbox, input.budget)
          output.log('Ration')
          output.log('')
          output.log(`Sandbox   ${sandbox.address}`)
          output.log(`Budget    ${formatUsdtBaseUnits(initialBalance)}`)
          output.log('Gas       paid from sandbox in USD₮')
          output.log('Access    restricted WDK MCP not connected yet')
          output.log('')
          output.log(`Starting ${input.command}...`)
          commandAttempted = true
          const result = await execute(input.command, input.commandArgs)
          exitCode = childExitCode(result)
        }
      }
    }
  } catch (error) {
    exitCode = operationExitCode(error)
    if (error instanceof CommandLaunchError) output.error(error.message)
    else if (error instanceof WalletTransferError || error instanceof WdkCliUnavailableError) {
      transferFailureMessage(error, input.budgetText, output)
    } else if (!sandbox) {
      output.error('Could not create the in-memory WDK sandbox.')
    } else {
      printWalletError(error, output, treasuryOpen ? 'Treasury' : 'Sandbox')
    }
  } finally {
    if (treasuryOpen && !(await lockWallets(new Set([TREASURY_NAME]), options, output))) exitCode = 1

    if (sandbox && initialBalance !== undefined) {
      try {
        finalBalance = await sandbox.getBalance()
        if (finalBalance > 0n) {
          const sweep = await sandbox.sweep(treasuryAddress)
          swept = sweep.amount
          if (swept === 0n) {
            output.error(`The remaining ${formatUsdtBaseUnits(finalBalance)} could not cover its sweep fee.`)
            exitCode = 1
          }
        }
      } catch {
        output.error('Security cleanup failed: the sandbox remainder could not be swept to the treasury.')
        exitCode = 1
      }
    }

    if (sandbox) {
      try {
        sandbox.dispose()
      } catch {
        output.error('Security cleanup failed: the ephemeral WDK sandbox could not be disposed.')
        exitCode = 1
      }
    }

    if (commandAttempted) {
      output.log('')
      output.log('Session complete')
      output.log('')
      if (finalBalance === undefined) {
        output.log('Spent      unavailable')
        output.log('Returned   unavailable')
      } else {
        const spent = initialBalance >= finalBalance ? initialBalance - finalBalance : 0n
        output.log(`Spent      ${formatUsdtBaseUnits(spent)}`)
        output.log(`Returned   ${formatUsdtBaseUnits(swept)}`)
      }
      output.log('Sandbox    disposed')
    }
  }

  return exitCode
}
