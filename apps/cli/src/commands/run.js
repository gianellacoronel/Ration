import { MAX_SESSION_TTL_MINUTES, NETWORK, SETUP_REQUIRED } from '../config.js'
import { balanceBaseUnits, formatUsdtBaseUnits, isRationWalletName, isTreasuryConfigured } from '../domain.js'
import { CommandLaunchError, WdkCliUnavailableError } from '../errors.js'
import { childExitCode, runRequestedCommand } from '../processes.js'
import { runWdkGetUsdtBalance, runWdkWalletUnlock } from '../wdk.js'
import {
  loadWallets,
  lockAllWallets,
  operationExitCode,
  printWalletError,
  requirePaymasterTokenMode,
  unavailableMessage
} from './shared.js'

function parseRunArgs (args) {
  if (args.length < 6 || args[0] !== 'run' || !args[1] ||
    args[2] !== '--ttl' || !/^\d+$/.test(args[3]) || args[4] !== '--' || !args[5]) return null

  const ttl = Number(args[3])
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > MAX_SESSION_TTL_MINUTES) return null
  return { name: args[1], ttl, command: args[5], commandArgs: args.slice(6) }
}

export async function runCommand (args, options, output) {
  const input = parseRunArgs(args)
  if (!input) {
    output.error('Usage: ration run <sandbox> --ttl <minutes> -- <command> [args...]')
    return 1
  }

  const wallets = await loadWallets(options, output)
  if (!wallets) return 1
  if (!isTreasuryConfigured(wallets)) {
    output.error(SETUP_REQUIRED)
    return 1
  }
  if (!wallets.some((wallet) => wallet.name === input.name && isRationWalletName(wallet.name))) {
    output.error(`Sandbox '${input.name}' was not found.`)
    return 1
  }
  if (!(await requirePaymasterTokenMode(options, output))) return 1

  const initialLock = await lockAllWallets(options, output, undefined, 'preparation')
  if (!initialLock.allLocked) return 1

  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const getBalance = options.runWdkGetUsdtBalance ?? runWdkGetUsdtBalance
  const execute = options.runRequestedCommand ?? runRequestedCommand
  let initialBalance
  let finalBalance
  let result
  let commandAttempted = false
  let exitCode = 0

  try {
    await unlock(input.name, { ttl: input.ttl })
    initialBalance = balanceBaseUnits(await getBalance(input.name, NETWORK))
    if (initialBalance <= 0n) {
      output.error(`Sandbox '${input.name}' is not funded.`)
      exitCode = 1
    } else {
      output.log('Ration')
      output.log('')
      output.log(`Sandbox   ${input.name}`)
      output.log(`Budget    ${formatUsdtBaseUnits(initialBalance)}`)
      output.log(`TTL       ${input.ttl}m`)
      output.log('Gas       paid from sandbox in USD₮')
      output.log('')
      output.log(`Starting ${input.command}...`)
      commandAttempted = true
      result = await execute(input.command, input.commandArgs)
      exitCode = childExitCode(result)
    }
  } catch (error) {
    exitCode = operationExitCode(error)
    if (error instanceof CommandLaunchError) output.error(error.message)
    else printWalletError(error, output, `Sandbox '${input.name}'`)
  } finally {
    if (initialBalance !== undefined && commandAttempted) {
      try {
        finalBalance = balanceBaseUnits(await getBalance(input.name, NETWORK))
      } catch (error) {
        if (error instanceof WdkCliUnavailableError) unavailableMessage(output)
        else output.error('Could not read the final sandbox balance through WDK.')
      }
    }

    const lockResult = await lockAllWallets(options, output, input.name)
    if (!lockResult.allLocked) exitCode = 1

    if (commandAttempted) {
      output.log('')
      output.log('Session complete')
      output.log('')
      if (finalBalance === undefined) {
        output.log('Spent      unavailable')
        output.log('Remaining  unavailable')
      } else {
        const spent = initialBalance >= finalBalance ? initialBalance - finalBalance : 0n
        output.log(`Spent      ${formatUsdtBaseUnits(spent)}`)
        output.log(`Remaining  ${formatUsdtBaseUnits(finalBalance)}`)
      }
      output.log(`Sandbox    ${lockResult.sandboxLocked ? 'locked' : 'lock failed'}`)
    }
  }

  return exitCode
}
