import { NETWORK, SETUP_REQUIRED, TREASURY_NAME } from '../config.js'
import { formatBalance, isRationWalletName, isTreasuryConfigured } from '../domain.js'
import { runWdkGetAddress, runWdkGetUsdtBalance, runWdkWalletUnlock } from '../wdk.js'
import { loadWallets, lockWallets, operationExitCode, printWalletError } from './shared.js'

const NAME_WIDTH = 13
const BALANCE_WIDTH = 12

function padCell (text, width, paint) {
  const padded = text.padEnd(width)
  return paint ? paint(padded) : padded
}

function sessionStatus (wallet, style) {
  if (!wallet.unlocked) return style.dim('locked')
  const remaining = typeof wallet.ttlRemaining === 'number' && wallet.ttlRemaining > 0
    ? Math.ceil(wallet.ttlRemaining / 60000)
    : null
  return style.cyan(remaining ? `active · ${remaining}m` : 'active')
}

function balanceCell (detail, withBalances, style) {
  return withBalances && detail.balance !== null
    ? padCell(detail.balance, BALANCE_WIDTH, style.green)
    : padCell('hidden', BALANCE_WIDTH, style.dim)
}

function renderList (managed, details, { verbose, withBalances, style }, output) {
  output.log(style.bold('Ration'))
  output.log('')
  output.log(style.bold('Treasury'))

  const treasury = managed[0]
  output.log(`  ${balanceCell(details.get(TREASURY_NAME), withBalances, style)}${sessionStatus(treasury, style)}`)

  output.log('')
  output.log(style.bold('Sandboxes'))

  const sandboxes = managed.slice(1)
  if (sandboxes.length > 0) {
    for (const wallet of sandboxes) {
      const detail = details.get(wallet.name)
      output.log(`  ${padCell(wallet.name, NAME_WIDTH, style.cyan)}${balanceCell(detail, withBalances, style)}${sessionStatus(wallet, style)}`)
      if (verbose && detail.address) output.log(`    ${style.dim(detail.address)}`)
    }
  } else {
    output.log(`  ${style.dim('None')}`)
  }

  const hints = []
  if (sandboxes.length === 0) hints.push(['ration create --budget <amount>', 'Create one'])
  if (!withBalances) hints.push(['ration list --balances', 'Reveal balances'])
  if (hints.length > 0) {
    output.log('')
    for (const [command, description] of hints) {
      output.log(`  ${command}   ${style.dim(description)}`)
    }
  }
}

export async function listCommand (args, options, output) {
  const flags = args.slice(1)
  if (flags.some((flag) => flag !== '--verbose' && flag !== '--balances')) {
    output.error('Usage: ration list [--verbose] [--balances]')
    return 1
  }
  const verbose = flags.includes('--verbose')
  const withBalances = flags.includes('--balances')
  const wallets = await loadWallets(options, output)
  if (!wallets) return 1
  if (!isTreasuryConfigured(wallets)) {
    output.error(SETUP_REQUIRED)
    return 1
  }

  const managed = [
    wallets.find((wallet) => wallet.name === TREASURY_NAME),
    ...wallets.filter((wallet) => isRationWalletName(wallet.name))
  ]
  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const getBalance = options.runWdkGetUsdtBalance ?? runWdkGetUsdtBalance
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const details = new Map()
  let exitCode = 0

  for (const wallet of managed) {
    const detail = { balance: null, address: null }
    try {
      // Balances and addresses need an unlocked wallet; without --balances the
      // listing never unlocks anything and never asks for a passphrase.
      if (withBalances && !wallet.unlocked) await unlock(wallet.name)
      const canRead = withBalances || wallet.unlocked
      if (withBalances) detail.balance = formatBalance(await getBalance(wallet.name, NETWORK))
      if (verbose && canRead) detail.address = (await getAddress(wallet.name, NETWORK)).address
    } catch (error) {
      exitCode = operationExitCode(error)
      printWalletError(error, output, wallet.name === TREASURY_NAME ? 'Treasury' : `Sandbox '${wallet.name}'`)
    }

    if (withBalances && !(await lockWallets(new Set([wallet.name]), options, output))) exitCode = 1
    details.set(wallet.name, detail)
    if (exitCode !== 0) break
  }
  if (exitCode !== 0) return exitCode

  renderList(managed, details, { verbose, withBalances, style: options.style }, output)
  return 0
}
