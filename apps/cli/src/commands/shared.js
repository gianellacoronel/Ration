import {
  WalletAddressError,
  WalletBalanceError,
  WalletListingError,
  WalletLockError,
  WalletTransferError,
  WalletUnlockError,
  WdkConfigError,
  WdkCliUnavailableError
} from '../errors.js'
import { inspectPaymasterTokenConfig } from '../paymaster.js'
import {
  runWdkGetNetworkConfig,
  runWdkWalletList,
  runWdkWalletLock,
  runWdkWalletLockAll
} from '../wdk.js'

export function parseSingleValueFlag (args, command, flag) {
  if (args.length !== 3 || args[0] !== command || args[1] !== flag ||
    !args[2] || args[2].startsWith('--')) return null
  return args[2]
}

export function unavailableMessage (output) {
  output.error('Ration could not find or start the official WDK CLI.')
  output.error('Run `npm install`, then try again.')
}

export function operationExitCode (error) {
  return error?.signal === 'SIGINT' ? 130 : 1
}

export function printWalletError (error, output, context) {
  if (error instanceof WdkCliUnavailableError) {
    unavailableMessage(output)
  } else if (error instanceof WalletUnlockError) {
    output.error(`${context} could not be unlocked. The passphrase was not accepted or setup was cancelled.`)
  } else if (error instanceof WalletAddressError) {
    output.error(`Could not resolve ${context.toLowerCase()} address through WDK.`)
  } else if (error instanceof WalletBalanceError) {
    output.error(`Could not read ${context.toLowerCase()} balance through WDK.`)
  } else {
    output.error(`${context} operation failed through WDK.`)
  }
}

export async function lockWallets (names, options, output) {
  let success = true
  const lock = options.runWdkWalletLock ?? runWdkWalletLock
  for (const name of [...names].reverse()) {
    try {
      await lock(name)
    } catch (error) {
      if (error instanceof WalletLockError && (
        error.wdkCode === 'WALLET_NOT_UNLOCKED' ||
        error.wdkCode === 'WALLET_LOCKED' ||
        /not unlocked|already locked/i.test(error.message)
      )) continue
      success = false
      output.error(`Security cleanup failed: '${name}' could not be locked.`)
      if (!(error instanceof WalletLockError) && !(error instanceof WdkCliUnavailableError)) throw error
    }
  }
  return success
}

export async function lockAllWallets (options, output, fallbackName, phase = 'cleanup') {
  try {
    await (options.runWdkWalletLockAll ?? runWdkWalletLockAll)()
    return { allLocked: true, sandboxLocked: true }
  } catch (error) {
    output.error(`Security ${phase} failed: WDK could not lock all wallets.`)
    if (!fallbackName) return { allLocked: false, sandboxLocked: false }

    try {
      const sandboxLocked = await lockWallets(new Set([fallbackName]), options, output)
      return { allLocked: false, sandboxLocked }
    } catch {
      return { allLocked: false, sandboxLocked: false }
    }
  }
}

export async function loadWallets (options, output, failurePrefix = 'Could not inspect wallets.') {
  try {
    return await (options.runWdkWalletList ?? runWdkWalletList)()
  } catch (error) {
    if (error instanceof WdkCliUnavailableError) unavailableMessage(output)
    else if (error instanceof WalletListingError) output.error(`${failurePrefix} ${error.message}`)
    else throw error
    return null
  }
}

export async function requirePaymasterTokenMode (options, output) {
  let config
  try {
    config = await (options.runWdkGetNetworkConfig ?? runWdkGetNetworkConfig)()
  } catch (error) {
    if (error instanceof WdkCliUnavailableError) unavailableMessage(output)
    else if (error instanceof WdkConfigError) output.error('Could not inspect WDK paymaster configuration.')
    else throw error
    return null
  }

  const paymaster = inspectPaymasterTokenConfig(config)
  if (paymaster.ready) return paymaster

  output.error('WDK Paymaster Token mode is not configured for the Ration Sepolia environment.')
  output.error('Use Candide\'s current public Sepolia endpoint and the registered test USD₮ paymaster token.')
  output.error('No Candide API key or sponsorship policy is required.')
  return null
}

export function transferFailureMessage (error, amount, output) {
  if (error instanceof WdkCliUnavailableError) {
    unavailableMessage(output)
    return
  }
  if (!(error instanceof WalletTransferError)) throw error

  if (error.wdkCode === 'INVALID_AMOUNT') {
    output.error(`Budget '${amount}' is not a valid positive USD₮ amount.`)
  } else if (
    error.wdkCode === 'INSUFFICIENT_BALANCE' ||
    error.wdkCode === 'INSUFFICIENT_FUNDS' ||
    /token balance lower/i.test(error.message)
  ) {
    output.error('The treasury does not have enough USD₮ for this amount and its gas fee.')
    output.error("Add USD₮ to the treasury address shown by 'ration setup', then try again.")
  } else if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
    output.error('The treasury was locked before funding completed. Try again.')
  } else {
    output.error('The USD₮ gas payment failed through Candide. Nothing was broadcast.')
    output.error('Check the paymaster availability and the wallet balance, then try again.')
  }
}
