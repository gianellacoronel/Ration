import { NETWORK, SETUP_REQUIRED, TREASURY_NAME } from '../config.js'
import { formatUsdtBaseUnits, isRationWalletName, isTreasuryConfigured, parseUsdt } from '../domain.js'
import { WalletTransferError, WdkCliUnavailableError } from '../errors.js'
import { confirmTransfer } from '../prompts.js'
import { runWdkGetAddress, runWdkTransfer, runWdkWalletUnlock } from '../wdk.js'
import {
  loadWallets,
  lockWallets,
  operationExitCode,
  printWalletError,
  transferFailureMessage
} from './shared.js'

export async function fundCommand (args, options, output) {
  if (args.length !== 4 || !args[1] || args[2] !== '--amount' ||
    !args[3] || args[3].startsWith('--')) {
    output.error('Usage: ration fund <sandbox> --amount <amount>')
    return 1
  }
  const name = args[1]
  const amount = args[3]
  const amountUnits = parseUsdt(amount)
  if (amountUnits === null) {
    output.error(`Amount '${amount}' must be a positive USD₮ amount with at most 6 decimal places.`)
    return 1
  }

  const wallets = await loadWallets(options, output)
  if (!wallets) return 1
  if (!isTreasuryConfigured(wallets)) {
    output.error(SETUP_REQUIRED)
    return 1
  }
  const sandbox = wallets.find((wallet) => wallet.name === name && isRationWalletName(wallet.name))
  if (!sandbox) {
    output.error(`Sandbox '${name}' was not found.`)
    return 1
  }

  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const transfer = options.runWdkTransfer ?? runWdkTransfer
  const confirm = options.confirmTransfer ?? confirmTransfer
  const locks = new Set([TREASURY_NAME, name])
  let exitCode = 0
  let result
  let cancelled = false

  try {
    const treasury = wallets.find((wallet) => wallet.name === TREASURY_NAME)
    if (!treasury.unlocked) await unlock(TREASURY_NAME)
    if (!sandbox.unlocked) await unlock(name)
    const address = (await getAddress(name, NETWORK)).address
    const input = {
      sourceWallet: TREASURY_NAME,
      network: NETWORK,
      to: address,
      amount,
      dryRun: true
    }
    const preview = await transfer(input)
    output.log('Sandbox funding preview')
    output.log(`  Sandbox       ${name}`)
    output.log(`  Amount        ${formatUsdtBaseUnits(amountUnits)}`)
    output.log(`  Estimated fee ${formatUsdtBaseUnits(preview.estimatedFee)}`)
    if (await confirm() !== true) cancelled = true
    else result = await transfer({ ...input, dryRun: false })
  } catch (error) {
    exitCode = operationExitCode(error)
    if (error instanceof WalletTransferError || error instanceof WdkCliUnavailableError) {
      transferFailureMessage(error, amount, output)
    } else {
      printWalletError(error, output, 'Sandbox')
    }
  }

  if (!(await lockWallets(locks, options, output))) exitCode = 1
  if (exitCode !== 0) return exitCode
  if (cancelled) output.log('Top-up cancelled. Nothing was broadcast.')
  else output.log(`Sandbox '${name}' funded with ${formatUsdtBaseUnits(amountUnits)}.`)
  if (options.verbose && result?.txHash) output.log(`Transaction: ${result.txHash}`)
  return 0
}
