import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const HELP = `Usage: ration <command> [options]

Commands:
  setup                 Create or recover the Ration treasury
  create --budget <n>   Create and fund a disposable sandbox
  list [--balances]     List the treasury and sandboxes
  help                  Show this help

Getting started:
  ration setup
  ration create --budget 5
  ration list`

const ADVANCED_HELP = `Advanced commands:
  setup --insecure                        Create the treasury without a passphrase
  fund <sandbox> --amount <n>             Top up a sandbox from the treasury
  unlock <sandbox>                        Open a temporary sandbox session
  address <wallet> --network <network>    Resolve a wallet address`

const TREASURY_NAME = 'rationtreasury'
const NETWORK = 'smart-account-sepolia'
const TOKEN = 'USDT'
const SESSION_TTL_MINUTES = 5
const DEBUG_SESSION_TTL_MINUTES = 60
const SETUP_REQUIRED = "Ration is not set up yet. Run 'ration setup' first."
const activeChildren = new Set()

export class WdkCliUnavailableError extends Error {}

export class WalletCreationError extends Error {
  constructor (code, signal) {
    super(signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${code}.`)
    this.code = code
    this.signal = signal
  }
}

export class WalletListingError extends Error {
  constructor (code, signal, message) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${code}.`))
    this.code = code
    this.signal = signal
  }
}

export class WalletUnlockError extends Error {
  constructor (code, signal) {
    super(signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${code}.`)
    this.code = code
    this.signal = signal
  }
}

export class WalletLockError extends Error {
  constructor (exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}

export class WalletAddressError extends Error {
  constructor (exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}

export class WalletBalanceError extends Error {
  constructor (exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}

export class WalletTransferError extends Error {
  constructor (phase, exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.phase = phase
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}

export function createWalletName (id = randomUUID()) {
  return `ration${id.replaceAll('-', '').slice(0, 4).toLowerCase()}`
}

export function isRationWalletName (name) {
  return /^ration[0-9a-f]{4}$/.test(name)
}

export function resolveWdkNetwork (network) {
  return network === 'sepolia' ? NETWORK : network
}

export function resolveWdkCliPath (resolve = import.meta.resolve) {
  try {
    return fileURLToPath(resolve('@tetherto/wdk-cli/bin/wdk.mjs'))
  } catch {
    throw new WdkCliUnavailableError('The official @tetherto/wdk-cli package is not available.')
  }
}

function watchChild (child, ErrorType, resolve, reject) {
  activeChildren.add(child)

  child.once('error', (error) => {
    activeChildren.delete(child)
    reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
  })
  child.once('close', (code, signal) => {
    activeChildren.delete(child)
    if (code === 0) resolve()
    else reject(new ErrorType(code, signal))
  })
}

function spawnInherited (args, ErrorType, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawnProcess(process.execPath, [wdkCliPath, ...args], { stdio: 'inherit' })
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }
    watchChild(child, ErrorType, resolve, reject)
  })
}

function spawnWithEmptyPassphrase (args, ErrorType, promptsToAnswer, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawnProcess(process.execPath, [wdkCliPath, ...args],
        { stdio: ['pipe', 'pipe', 'inherit'] })
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }

    let remaining = promptsToAnswer
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk)
      if (remaining > 0 && /assphrase/i.test(chunk)) {
        remaining -= 1
        setTimeout(() => { child.stdin.write('\n') }, 150)
      }
    })

    watchChild(child, ErrorType, resolve, reject)
  })
}

function spawnJson (args, ErrorType, validate, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawnProcess(
        process.execPath,
        [wdkCliPath, ...args, '--json'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }
    activeChildren.add(child)

    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.resume()

    child.once('error', (error) => {
      activeChildren.delete(child)
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
    })
    child.once('close', (exitCode, signal) => {
      activeChildren.delete(child)
      let result
      try {
        result = JSON.parse(stdout)
      } catch {
        result = null
      }

      if (exitCode !== 0) {
        const message = typeof result?.error === 'string' ? result.error : undefined
        const wdkCode = typeof result?.code === 'string' ? result.code : undefined
        reject(new ErrorType(exitCode, signal, message, wdkCode))
        return
      }

      if (!validate(result)) {
        reject(new ErrorType(exitCode, signal, 'WDK returned an unexpected structured result.'))
        return
      }
      resolve(result)
    })
  })
}

export function runWdkWalletCreate (name, options = {}) {
  const { emptyPassphrase, ...rest } = options
  if (emptyPassphrase) {
    return spawnWithEmptyPassphrase(['wallet', 'create', '--name', name], WalletCreationError, 2, rest)
  }
  return spawnInherited(['wallet', 'create', '--name', name], WalletCreationError, rest)
}

export function runWdkWalletList (options = {}) {
  return spawnJson(
    ['wallet', 'list'],
    WalletListingError,
    (result) => Array.isArray(result?.wallets) &&
      result.wallets.every((wallet) => typeof wallet?.name === 'string'),
    options
  ).then((result) => result.wallets)
}

export function runWdkWalletUnlock (name, options = {}) {
  const ttl = options.ttl ?? SESSION_TTL_MINUTES
  const args = ['wallet', 'unlock', '--name', name, '--ttl', String(ttl)]
  const { emptyPassphrase, ...rest } = options
  if (emptyPassphrase) {
    return spawnWithEmptyPassphrase(args, WalletUnlockError, 1, rest)
  }
  return spawnInherited(args, WalletUnlockError, rest)
}

export function runWdkWalletLock (name, options = {}) {
  return spawnJson(
    ['wallet', 'lock', '--name', name],
    WalletLockError,
    (result) => result?.wallet === name && result?.locked === true,
    options
  )
}

export function runWdkGetAddress (wallet, network = NETWORK, options = {}) {
  return spawnJson(
    ['get', 'address', '--wallet', wallet, '--network', network],
    WalletAddressError,
    (result) => result?.network === network && typeof result?.address === 'string',
    options
  )
}

export function runWdkGetUsdtBalance (wallet, network = NETWORK, options = {}) {
  return spawnJson(
    ['get', 'balance', '--wallet', wallet, '--network', network, '--token', TOKEN],
    WalletBalanceError,
    (result) => result?.network === network && result?.symbol === TOKEN &&
      typeof result?.balance === 'string' && typeof result?.formatted === 'string',
    options
  )
}

export function runWdkTransfer (input, options = {}) {
  const phase = input.dryRun ? 'dry-run' : 'broadcast'
  const args = [
    'send',
    '--wallet', input.sourceWallet,
    '--network', input.network,
    '--to', input.to,
    '--amount', input.amount,
    '--token', TOKEN
  ]
  if (input.dryRun) args.push('--dry-run')

  return spawnJson(
    args,
    class extends WalletTransferError {
      constructor (exitCode, signal, message, wdkCode) {
        super(phase, exitCode, signal, message, wdkCode)
      }
    },
    (result) => {
      if (result?.network !== input.network || result?.to !== input.to) return false
      if (input.dryRun) {
        return result?.tokenSymbol === TOKEN &&
          typeof result?.amountFormatted === 'string' &&
          typeof result?.estimatedFee === 'string'
      }
      return typeof result?.txHash === 'string' && result.txHash.length > 0
    },
    options
  )
}

export async function confirmTransfer (options = {}) {
  const readline = createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout
  })
  try {
    const closed = new Promise((resolve) => readline.once('close', () => resolve(null)))
    readline.once('SIGINT', () => readline.close())
    const answer = await Promise.race([
      readline.question('Fund this sandbox? [y/N] '),
      closed
    ])
    if (typeof answer !== 'string') return false
    return ['y', 'yes'].includes(answer.trim().toLowerCase())
  } finally {
    readline.close()
  }
}

function parseUsdt (value) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return null
  const [integer, fraction = ''] = value.split('.')
  const amount = BigInt(integer) * 1000000n + BigInt(fraction.padEnd(6, '0'))
  return amount > 0n ? amount : null
}

function formatUsdtBaseUnits (value) {
  const amount = BigInt(value)
  const integer = amount / 1000000n
  const fraction = (amount % 1000000n).toString().padStart(6, '0')
  const visibleFraction = fraction.slice(0, 2) + fraction.slice(2).replace(/0+$/, '')
  return `${integer}.${visibleFraction} USDT`
}

function balanceBaseUnits (result) {
  if (typeof result?.balance === 'string' && /^\d+$/.test(result.balance)) {
    return BigInt(result.balance)
  }
  const match = result?.formatted?.match(/^(\d+(?:\.\d{1,6})?)\s+USDT$/)
  return match ? parseUsdt(match[1]) ?? 0n : 0n
}

function formatBalance (result) {
  return formatUsdtBaseUnits(balanceBaseUnits(result))
}

function createUniqueWalletName (wallets, generator) {
  const existing = new Set(wallets.map((wallet) => wallet.name))
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = generator()
    if (isRationWalletName(name) && !existing.has(name)) return name
  }
  throw new Error('Could not generate a unique sandbox identifier.')
}

function parseSingleValueFlag (args, command, flag) {
  if (args.length !== 3 || args[0] !== command || args[1] !== flag ||
    !args[2] || args[2].startsWith('--')) return null
  return args[2]
}

function isTreasuryConfigured (wallets) {
  return wallets.some((wallet) => wallet.name === TREASURY_NAME)
}

function unavailableMessage (output) {
  output.error('Ration could not find or start the official WDK CLI.')
  output.error('Run `npm install`, then try again.')
}

function operationExitCode (error) {
  return error?.signal === 'SIGINT' ? 130 : 1
}

function printWalletError (error, output, context) {
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

async function lockWallets (names, options, output) {
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

async function loadWallets (options, output, failurePrefix = 'Could not inspect wallets.') {
  try {
    return await (options.runWdkWalletList ?? runWdkWalletList)()
  } catch (error) {
    if (error instanceof WdkCliUnavailableError) unavailableMessage(output)
    else if (error instanceof WalletListingError) output.error(`${failurePrefix} ${error.message}`)
    else throw error
    return null
  }
}

function transferFailureMessage (error, amount, output) {
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
    output.error('The treasury does not have enough USD₮ for this budget and its transaction fee.')
    output.error("Add USD₮ to the treasury address shown by 'ration setup', then try again.")
  } else if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
    output.error('The treasury was locked before funding completed. Try again.')
  } else {
    output.error('Funding failed through WDK. Try again.')
  }
}

async function setupCommand (options, output, { insecure = false } = {}) {
  let wallets = await loadWallets(options, output)
  if (!wallets) return 1

  const create = options.runWdkWalletCreate ?? runWdkWalletCreate
  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const locks = new Set()
  let exitCode = 0
  let address

  try {
    const existing = isTreasuryConfigured(wallets)
    if (!existing) {
      if (insecure) {
        output.log('Creating your Ration treasury WITHOUT a passphrase...')
        output.log('WARNING: anyone with access to this machine can spend its funds.')
      } else {
        output.log('Creating your Ration treasury...')
        output.log('WDK will ask you to protect and back up this wallet. Ration never sees those secrets.')
      }
      await create(TREASURY_NAME, insecure ? { emptyPassphrase: true } : {})
      locks.add(TREASURY_NAME)
      wallets = await loadWallets(options, output)
      if (!wallets || !isTreasuryConfigured(wallets)) throw new Error('Treasury creation could not be verified.')
    } else {
      locks.add(TREASURY_NAME)
      output.log('Ration treasury already exists. Checking its address...')
    }

    const treasury = wallets.find((wallet) => wallet.name === TREASURY_NAME)
    if (!treasury.unlocked) {
      await unlock(TREASURY_NAME, insecure ? { emptyPassphrase: true } : {})
    }
    address = (await getAddress(TREASURY_NAME, NETWORK)).address
  } catch (error) {
    exitCode = operationExitCode(error)
    if (error instanceof WalletCreationError) {
      output.error(`Treasury creation failed. ${error.message}`)
    } else if (insecure && error instanceof WalletUnlockError) {
      output.error('The treasury could not be unlocked with an empty passphrase.')
      output.error("It was probably created securely. Run 'ration setup' without --insecure.")
    } else {
      printWalletError(error, output, 'Treasury')
    }
  }

  if (!(await lockWallets(locks, options, output))) exitCode = 1
  if (exitCode !== 0) return exitCode

  output.log('')
  output.log('Treasury ready')
  output.log(`  Address   ${address}`)
  output.log('  Status    locked')
  output.log('')
  output.log('Fund this address with test USD₮ before creating a sandbox.')
  return 0
}

async function createCommand (args, options, output) {
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

  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const create = options.runWdkWalletCreate ?? runWdkWalletCreate
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const getBalance = options.runWdkGetUsdtBalance ?? runWdkGetUsdtBalance
  const transfer = options.runWdkTransfer ?? runWdkTransfer
  const confirm = options.confirmTransfer ?? confirmTransfer
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

    const treasuryBalance = await getBalance(TREASURY_NAME, NETWORK)
    if (balanceBaseUnits(treasuryBalance) < budgetUnits) {
      output.error(`The treasury needs at least ${formatUsdtBaseUnits(budgetUnits)} for this sandbox.`)
      output.error("Add USD₮ to the treasury address shown by 'ration setup', then try again.")
      exitCode = 1
    } else {
      output.log(`Creating sandbox '${name}'...`)
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

      output.log('')
      output.log('Sandbox funding preview')
      output.log(`  Sandbox       ${name}`)
      output.log(`  Address       ${address}`)
      output.log(`  Budget        ${formatUsdtBaseUnits(budgetUnits)}`)
      output.log(`  Estimated fee ${formatUsdtBaseUnits(preview.estimatedFee)}`)
      output.log('')

      if (await confirm() !== true) {
        cancelled = true
      } else {
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

  output.log('Sandbox created')
  output.log(`  Sandbox   ${name}`)
  output.log(`  Address   ${address}`)
  output.log(`  Balance   ${formatUsdtBaseUnits(budgetUnits)}`)
  output.log('  Status    locked')
  if (options.verbose && result?.txHash) output.log(`  Transaction ${result.txHash}`)
  return 0
}

async function listCommand (args, options, output) {
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

  const treasury = details.get(TREASURY_NAME)
  output.log('Treasury')
  output.log(`  Balance   ${treasury.balance ?? '—'}`)
  if (verbose) output.log(`  Address   ${treasury.address ?? '(locked — unlock to see its address)'}`)
  output.log('')
  output.log('Sandboxes')
  output.log('')

  const sandboxes = managed.slice(1)
  if (sandboxes.length === 0) {
    output.log("  None. Run 'ration create --budget <amount>' to create one.")
    if (!withBalances) {
      output.log('')
      output.log("Locked wallets hide their balance and address. Run 'ration list --balances' to see them.")
    }
    return 0
  }

  output.log(withBalances ? 'SANDBOX      BALANCE          STATUS' : 'SANDBOX      STATUS')
  for (const wallet of sandboxes) {
    const detail = details.get(wallet.name)
    const balance = withBalances ? `${detail.balance.padEnd(17)}` : ''
    output.log(`${wallet.name.padEnd(13)}${balance}locked`)
    if (verbose && detail.address) output.log(`  Address: ${detail.address}`)
  }
  if (!withBalances) {
    output.log('')
    output.log("Locked wallets hide their balance and address. Run 'ration list --balances' to see them.")
  }
  return 0
}

async function fundCommand (args, options, output) {
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

async function debugUnlockCommand (args, options, output) {
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
  if (!wallets.some((wallet) => wallet.name === name &&
    isRationWalletName(name))) {
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

async function debugAddressCommand (args, options, output) {
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

async function dispatchMain (args, options = {}) {
  const output = options.output ?? console

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' ||
    (args[0] === 'help' && args.length === 1)) {
    output.log(HELP)
    return 0
  }
  if (args[0] === 'help' && args[1] === '--advanced' && args.length === 2) {
    output.log(ADVANCED_HELP)
    return 0
  }
  if (args[0] === 'setup' && args.length === 1) return setupCommand(options, output)
  if (args[0] === 'setup' && args.length === 2 && args[1] === '--insecure') {
    return setupCommand(options, output, { insecure: true })
  }
  if (args[0] === 'create') return createCommand(args, options, output)
  if (args[0] === 'list') return listCommand(args, options, output)
  if (args[0] === 'fund') return fundCommand(args, options, output)
  if (args[0] === 'unlock') return debugUnlockCommand(args, options, output)
  if (args[0] === 'address') return debugAddressCommand(args, options, output)

  output.error(`Unknown command: ${args.join(' ')}`)
  output.error("Run 'ration help' for usage.")
  return 1
}

export async function main (args, options = {}) {
  let interrupted
  const onSignal = (signal) => {
    interrupted ??= signal
    for (const child of activeChildren) {
      if (typeof child.kill === 'function') child.kill(signal)
    }
  }
  const onSigint = () => onSignal('SIGINT')
  const onSigterm = () => onSignal('SIGTERM')
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)

  let exitCode
  try {
    exitCode = await dispatchMain(args, options)
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
  if (interrupted === 'SIGINT') return 130
  if (interrupted === 'SIGTERM') return 143
  return exitCode
}
