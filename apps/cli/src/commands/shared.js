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
import { inspectStandardSepoliaConfig } from '../network.js'
import {
  runWdkGetNetworkConfig,
  runWdkWalletList,
  runWdkWalletLock
} from '../wdk.js'

export function unavailableMessage (output) {
  output.error('Ration could not find or start the official WDK CLI.')
  output.error('Run `npm install`, then try again.')
}

export function operationExitCode (error) {
  return error?.signal === 'SIGINT' ? 130 : 1
}

export function throwIfInterrupted (signal) {
  if (!signal?.aborted) return
  const error = new Error('Ration was interrupted.')
  error.signal = signal.reason
  throw error
}

export function printWalletError (error, output, context) {
  if (error instanceof WdkCliUnavailableError) {
    unavailableMessage(output)
  } else if (error instanceof WalletUnlockError) {
    output.error(`${context} could not be unlocked. The passphrase was not accepted or setup was cancelled.`)
  } else if (error instanceof WalletAddressError) {
    output.error(`Could not resolve ${context.toLowerCase()} address through WDK.`)
  } else if (error instanceof WalletBalanceError) {
    if (/chain is not available|free plan|network error|server error|timeout/i.test(error.message)) {
      output.error('The configured Sepolia RPC provider could not serve the balance request.')
    } else {
      output.error(`Could not read ${context.toLowerCase()} balance through WDK.`)
    }
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

export async function loadWallets (options, output) {
  try {
    return await (options.runWdkWalletList ?? runWdkWalletList)()
  } catch (error) {
    if (error instanceof WdkCliUnavailableError) unavailableMessage(output)
    else if (error instanceof WalletListingError) output.error(`Could not inspect wallets. ${error.message}`)
    else throw error
    return null
  }
}

export async function requireStandardSepolia (options, output) {
  let config
  try {
    config = await (options.runWdkGetNetworkConfig ?? runWdkGetNetworkConfig)()
  } catch (error) {
    if (error instanceof WdkCliUnavailableError) unavailableMessage(output)
    else if (error instanceof WdkConfigError) output.error('Could not inspect the WDK Sepolia configuration.')
    else throw error
    return null
  }

  const standard = inspectStandardSepoliaConfig(config)
  if (standard.ready) return standard

  output.error("WDK's standard Sepolia EVM network is not configured for Ration.")
  output.error("Use the official 'sepolia' network with @tetherto/wdk-wallet-evm and a working RPC provider.")
  return null
}

export function transferFailureMessage (error, amount, asset, output) {
  if (error instanceof WdkCliUnavailableError) {
    unavailableMessage(output)
    return
  }
  if (!(error instanceof WalletTransferError)) throw error

  if (error.wdkCode === 'INVALID_AMOUNT' && asset === 'USDT') {
    output.error(`Budget '${amount}' is not a valid positive USD₮ amount.`)
  } else if (
    error.wdkCode === 'INSUFFICIENT_BALANCE' ||
    error.wdkCode === 'INSUFFICIENT_FUNDS' ||
    /token balance lower|insufficient funds/i.test(error.message)
  ) {
    if (asset === 'ETH') {
      output.error('The treasury does not have enough Sepolia ETH to provision sandbox gas.')
      output.error("Add Sepolia ETH to the treasury address shown by 'ration setup', then try again.")
    } else {
      output.error('The treasury does not have enough USD₮ for this budget.')
      output.error("Add test USD₮ to the treasury address shown by 'ration setup', then try again.")
    }
  } else if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
    output.error('The treasury was locked before funding completed. Try again.')
  } else {
    output.error(`The treasury ${asset} transfer failed through WDK.`)
    output.error('Ration will reconcile and recover any funds that may have been submitted.')
  }
}
