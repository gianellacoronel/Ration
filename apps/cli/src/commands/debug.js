import { DEBUG_SESSION_TTL_MINUTES, NETWORK, TREASURY_NAME } from '../config.js'
import { isRationWalletName } from '../domain.js'
import { resolveWdkNetwork, runWdkGetAddress, runWdkWalletUnlock } from '../wdk.js'
import { loadWallets, operationExitCode, printWalletError } from './shared.js'

export async function debugUnlockCommand (args, options, output) {
  if (args.length !== 2 || !args[1]) {
    output.error('Usage: ration unlock <wallet>')
    return 1
  }
  const wallets = await loadWallets(options, output)
  if (!wallets) return 1
  const name = args[1]
  if (name === TREASURY_NAME) {
    output.error('The treasury cannot be left unlocked. Ration only opens it for a specific operation.')
    return 1
  }
  if (!wallets.some((wallet) => wallet.name === name && isRationWalletName(name))) {
    output.error(`Ration wallet '${name}' was not found.`)
    return 1
  }
  try {
    await (options.runWdkWalletUnlock ?? runWdkWalletUnlock)(name, { ttl: DEBUG_SESSION_TTL_MINUTES })
  } catch (error) {
    printWalletError(error, output, 'Wallet')
    return operationExitCode(error)
  }
  output.log(`Wallet '${name}' is unlocked for ${DEBUG_SESSION_TTL_MINUTES} minutes.`)
  return 0
}

export async function debugAddressCommand (args, options, output) {
  if (args.length !== 4 || !args[1] || args[2] !== '--network' || !args[3]) {
    output.error('Usage: ration address <wallet> --network <network>')
    return 1
  }
  const wallets = await loadWallets(options, output)
  if (!wallets) return 1
  const name = args[1]
  if (resolveWdkNetwork(args[3]) !== NETWORK) {
    output.error('Ration addresses are only available for the default Sepolia environment.')
    return 1
  }
  if (!wallets.some((wallet) => wallet.name === name &&
    (name === TREASURY_NAME || isRationWalletName(name)))) {
    output.error(`Ration wallet '${name}' was not found.`)
    return 1
  }
  try {
    const result = await (options.runWdkGetAddress ?? runWdkGetAddress)(name, NETWORK)
    output.log(`Address: ${result.address}`)
    return 0
  } catch (error) {
    printWalletError(error, output, 'Wallet')
    return operationExitCode(error)
  }
}
