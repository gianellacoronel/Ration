import { NETWORK, SETUP_REQUIRED, TREASURY_NAME } from '../config.js'
import {
  balanceBaseUnits,
  createUniqueWalletName,
  createWalletName,
  formatUsdtBaseUnits,
  isTreasuryConfigured,
  parseUsdt
} from '../domain.js'
import {
  WalletAddressError,
  WalletCreationError,
  WalletTransferError,
  WdkCliUnavailableError
} from '../errors.js'
import { confirmTransfer } from '../prompts.js'
import { paymasterTokenFee } from '../paymaster.js'
import {
  runWdkGetAddress,
  runWdkGetUsdtBalance,
  runWdkTransfer,
  runWdkWalletCreate,
  runWdkWalletUnlock
} from '../wdk.js'
import {
  loadWallets,
  lockWallets,
  operationExitCode,
  parseSingleValueFlag,
  printWalletError,
  requirePaymasterTokenMode,
  throwIfInterrupted,
  transferFailureMessage
} from './shared.js'

export async function createCommand (args, options, output) {
  const budget = parseSingleValueFlag(args, 'create', '--budget')
  if (!budget) {
    output.error('Usage: ration create --budget <amount>')
    return 1
  }
  const budgetUnits = parseUsdt(budget)
  if (budgetUnits === null) {
    output.error(`Budget '${budget}' must be a positive USD₮ amount with at most 6 decimal places.`)
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

  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const create = options.runWdkWalletCreate ?? runWdkWalletCreate
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const getBalance = options.runWdkGetUsdtBalance ?? runWdkGetUsdtBalance
  const transfer = options.runWdkTransfer ?? runWdkTransfer
  const confirm = options.confirmTransfer ?? (() => confirmTransfer({ signal: options.signal }))
  const generator = options.createWalletName ?? createWalletName
  const name = createUniqueWalletName(wallets, generator)
  const locks = new Set([TREASURY_NAME])
  let exitCode = 0
  let address
  let result
  let cancelled = false

  try {
    const treasury = wallets.find((wallet) => wallet.name === TREASURY_NAME)
    if (!treasury.unlocked) await unlock(TREASURY_NAME)

    const treasuryBalance = balanceBaseUnits(await getBalance(TREASURY_NAME, NETWORK))
    output.log(`Creating persistent debug sandbox '${name}'...`)
    await create(name)
    locks.add(name)
    await unlock(name)
    address = (await getAddress(name, NETWORK)).address

    const transferInput = {
      sourceWallet: TREASURY_NAME,
      network: NETWORK,
      to: address,
      amount: budget,
      dryRun: true
    }
    const preview = await transfer(transferInput)
    const fee = paymasterTokenFee(preview)
    if (fee === null) {
      output.error('WDK did not return a valid USD₮ gas quote. Nothing was broadcast.')
      exitCode = 1
    } else if (fee >= paymaster.transferMaxFee) {
      const limit = formatUsdtBaseUnits(paymaster.transferMaxFee)
      output.error(`The estimated gas fee ${formatUsdtBaseUnits(fee)} exceeds the WDK safety limit of ${limit}.`)
      output.error('Nothing was broadcast.')
      exitCode = 1
    } else {
      const total = budgetUnits + fee
      output.log('')
      output.log('Sandbox funding preview')
      output.log(`  Sandbox      ${name}`)
      output.log(`  Address      ${address}`)
      output.log(`  Budget       ${formatUsdtBaseUnits(budgetUnits)}`)
      output.log(`  Network fee  ${formatUsdtBaseUnits(fee)}`)
      output.log(`  Total        ${formatUsdtBaseUnits(total)}`)
      output.log('')

      if (treasuryBalance < total) {
        output.error(`Insufficient treasury funds: available ${formatUsdtBaseUnits(treasuryBalance)}, required ${formatUsdtBaseUnits(total)}.`)
        output.error("Add USD₮ to the treasury address shown by 'ration setup', then try again.")
        exitCode = 1
      } else if (await confirm() !== true) {
        cancelled = true
      } else {
        throwIfInterrupted(options.signal)
        result = await transfer({ ...transferInput, dryRun: false })
      }
    }
  } catch (error) {
    exitCode = operationExitCode(error)
    if (error instanceof WalletCreationError) {
      output.error(`Sandbox creation failed. ${error.message}`)
    } else if (error instanceof WalletTransferError || error instanceof WdkCliUnavailableError) {
      transferFailureMessage(error, budget, output)
    } else {
      printWalletError(error, output, error instanceof WalletAddressError ? 'Sandbox' : 'Treasury')
    }
  }

  if (!(await lockWallets(locks, options, output))) exitCode = 1
  if (exitCode !== 0) return exitCode

  if (cancelled) {
    output.log(`Sandbox '${name}' was created empty and locked. Nothing was broadcast.`)
    return 0
  }

  output.log('Persistent debug sandbox created')
  output.log(`  Sandbox   ${name}`)
  output.log(`  Address   ${address}`)
  output.log(`  Balance   ${formatUsdtBaseUnits(budgetUnits)}`)
  output.log('  Status    locked')
  if (options.verbose && result?.txHash) output.log(`  Transaction ${result.txHash}`)
  return 0
}
