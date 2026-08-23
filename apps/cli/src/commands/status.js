import { NETWORK, SETUP_REQUIRED, TREASURY_NAME } from '../config.js'
import {
  balanceBaseUnits,
  formatEthBaseUnits,
  formatUsdtBaseUnits,
  isTreasuryConfigured,
  nativeBalanceBaseUnits
} from '../domain.js'
import {
  runWdkGetAddress,
  runWdkGetEthBalance,
  runWdkGetUsdtBalance,
  runWdkWalletUnlock
} from '../wdk.js'
import {
  loadWallets,
  lockWallets,
  operationExitCode,
  printWalletError,
  throwIfInterrupted
} from './shared.js'

export async function statusCommand (args, options, output) {
  if (args.length !== 1 || args[0] !== 'status') {
    output.error('Usage: ration status')
    return 1
  }

  const wallets = await loadWallets(options, output)
  if (!wallets) return 1
  if (!isTreasuryConfigured(wallets)) {
    output.error(SETUP_REQUIRED)
    return 1
  }

  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const getUsdtBalance = options.runWdkGetUsdtBalance ?? runWdkGetUsdtBalance
  const getEthBalance = options.runWdkGetEthBalance ?? runWdkGetEthBalance
  const treasury = wallets.find((wallet) => wallet.name === TREASURY_NAME)
  let address
  let usdtBalance
  let ethBalance
  let exitCode = 0

  try {
    if (!treasury.unlocked) await unlock(TREASURY_NAME)
    throwIfInterrupted(options.signal)
    address = (await getAddress(TREASURY_NAME, NETWORK)).address
    usdtBalance = balanceBaseUnits(await getUsdtBalance(TREASURY_NAME, NETWORK))
    ethBalance = nativeBalanceBaseUnits(await getEthBalance(TREASURY_NAME, NETWORK))
  } catch (error) {
    exitCode = operationExitCode(error)
    printWalletError(error, output, 'Treasury')
  }

  if (!(await lockWallets(new Set([TREASURY_NAME]), options, output))) exitCode = 1
  if (exitCode !== 0) return exitCode

  output.log('Ration treasury')
  output.log('')
  output.log(`Address   ${address}`)
  output.log(`USDT      ${formatUsdtBaseUnits(usdtBalance)}`)
  output.log(`Gas       ${formatEthBaseUnits(ethBalance)}`)
  output.log('Status    locked')
  return 0
}
