import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const HELP = `Usage: ration <command> [options]

Commands:
  create    Create a disposable wallet managed by WDK
  list      List Ration wallets and unlocked addresses
  unlock    Unlock a Ration wallet for a WDK session
  address   Get a Ration wallet address for a network
  fund      Fund a Ration wallet with USD₮ from another WDK wallet
  help      Show this help`

const ADDRESS_USAGE = 'Usage: ration address <wallet> --network <network>'
const LIST_USAGE = 'Usage: ration list [--network <network>]'
const UNLOCK_USAGE = 'Usage: ration unlock <wallet>'
const FUND_USAGE = 'Usage: ration fund <wallet> --from <source-wallet> --amount <amount> --network <network>'
const DEFAULT_LIST_NETWORK = 'sepolia'
const FUND_TOKEN = 'USDT'
const RATION_SESSION_TTL_MINUTES = 60

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

export class WalletUnlockError extends Error {
  constructor (code, signal) {
    super(signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${code}.`)
    this.code = code
    this.signal = signal
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

export function createWalletName (now = new Date(), id = randomUUID()) {
  const timestamp = now.toISOString().replace(/[-:.]/g, '').replace('Z', '')
  return `ration-${timestamp}-${id.slice(0, 8)}`
}

export function isRationWalletName (name) {
  return /^ration-\d{8}T\d{9}-[0-9a-f]{8}$/.test(name)
}

export function resolveWdkCliPath (resolve = import.meta.resolve) {
  try {
    return fileURLToPath(resolve('@tetherto/wdk-cli/bin/wdk.mjs'))
  } catch {
    throw new WdkCliUnavailableError('The official @tetherto/wdk-cli package is not available.')
  }
}

export function runWdkWalletCreate (name, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()

  return new Promise((resolve, reject) => {
    let child

    try {
      child = spawnProcess(
        process.execPath,
        [wdkCliPath, 'wallet', 'create', '--name', name],
        { stdio: 'inherit' }
      )
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }

    child.once('error', (error) => {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
    })
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new WalletCreationError(code, signal))
    })
  })
}

export function runWdkWalletList (options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()

  return new Promise((resolve, reject) => {
    let child

    try {
      child = spawnProcess(
        process.execPath,
        [wdkCliPath, 'wallet', 'list', '--json'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }

    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.resume()

    child.once('error', (error) => {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
    })
    child.once('close', (code, signal) => {
      if (code !== 0) {
        reject(new WalletListingError(code, signal))
        return
      }

      try {
        const result = JSON.parse(stdout)
        if (!Array.isArray(result.wallets) || result.wallets.some((wallet) => typeof wallet.name !== 'string')) {
          throw new Error('invalid wallet list')
        }
        resolve(result.wallets)
      } catch {
        reject(new WalletListingError(code, signal, 'WDK returned an unexpected wallet list.'))
      }
    })
  })
}

export function runWdkWalletUnlock (name, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()

  return new Promise((resolve, reject) => {
    let child

    try {
      child = spawnProcess(
        process.execPath,
        [
          wdkCliPath,
          'wallet',
          'unlock',
          '--name',
          name,
          '--ttl',
          String(RATION_SESSION_TTL_MINUTES)
        ],
        { stdio: 'inherit' }
      )
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }

    child.once('error', (error) => {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
    })
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new WalletUnlockError(code, signal))
    })
  })
}

export function runWdkGetAddress (wallet, network, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()

  return new Promise((resolve, reject) => {
    let child

    try {
      child = spawnProcess(
        process.execPath,
        [wdkCliPath, 'get', 'address', '--wallet', wallet, '--network', network, '--json'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }

    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.resume()

    child.once('error', (error) => {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
    })
    child.once('close', (exitCode, signal) => {
      let result
      try {
        result = JSON.parse(stdout)
      } catch {
        result = null
      }

      if (exitCode !== 0) {
        const message = typeof result?.error === 'string' ? result.error : undefined
        const wdkCode = typeof result?.code === 'string' ? result.code : undefined
        reject(new WalletAddressError(exitCode, signal, message, wdkCode))
        return
      }

      if (
        typeof result?.address !== 'string' ||
        typeof result?.network !== 'string' ||
        result.network !== network
      ) {
        reject(new WalletAddressError(exitCode, signal, 'WDK returned an unexpected address result.'))
        return
      }

      resolve(result)
    })
  })
}

export function runWdkGetUsdtBalance (wallet, network, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()

  return new Promise((resolve, reject) => {
    let child

    try {
      child = spawnProcess(
        process.execPath,
        [
          wdkCliPath,
          'get',
          'balance',
          '--wallet',
          wallet,
          '--network',
          network,
          '--token',
          FUND_TOKEN,
          '--json'
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }

    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.resume()

    child.once('error', (error) => {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
    })
    child.once('close', (exitCode, signal) => {
      let result
      try {
        result = JSON.parse(stdout)
      } catch {
        result = null
      }

      if (exitCode !== 0) {
        const message = typeof result?.error === 'string' ? result.error : undefined
        const wdkCode = typeof result?.code === 'string' ? result.code : undefined
        reject(new WalletBalanceError(exitCode, signal, message, wdkCode))
        return
      }

      if (
        result?.network !== network ||
        result?.symbol !== FUND_TOKEN ||
        typeof result?.formatted !== 'string'
      ) {
        reject(new WalletBalanceError(exitCode, signal, 'WDK returned an unexpected balance result.'))
        return
      }

      resolve(result)
    })
  })
}

export function runWdkTransfer (input, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()
  const phase = input.dryRun ? 'dry-run' : 'broadcast'
  const args = [
    wdkCliPath,
    'send',
    '--wallet',
    input.sourceWallet,
    '--network',
    input.network,
    '--to',
    input.to,
    '--amount',
    input.amount,
    '--token',
    FUND_TOKEN
  ]
  if (input.dryRun) args.push('--dry-run')
  args.push('--json')

  return new Promise((resolve, reject) => {
    let child

    try {
      child = spawnProcess(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }

    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.resume()

    child.once('error', (error) => {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
    })
    child.once('close', (exitCode, signal) => {
      let result
      try {
        result = JSON.parse(stdout)
      } catch {
        result = null
      }

      if (exitCode !== 0) {
        const message = typeof result?.error === 'string' ? result.error : undefined
        const wdkCode = typeof result?.code === 'string' ? result.code : undefined
        reject(new WalletTransferError(phase, exitCode, signal, message, wdkCode))
        return
      }

      const validPreview = input.dryRun &&
        result?.network === input.network &&
        result?.to === input.to &&
        typeof result?.amountFormatted === 'string' &&
        result?.tokenSymbol === FUND_TOKEN &&
        typeof result?.estimatedFee === 'string' &&
        typeof result?.estimatedFeeFormatted === 'string'
      const validTransfer = !input.dryRun &&
        result?.network === input.network &&
        result?.to === input.to &&
        typeof result?.from === 'string' &&
        typeof result?.amountFormatted === 'string' &&
        typeof result?.txHash === 'string' &&
        result.txHash.length > 0

      if (!validPreview && !validTransfer) {
        reject(new WalletTransferError(
          phase,
          exitCode,
          signal,
          `WDK returned an unexpected ${input.dryRun ? 'transfer preview' : 'transfer result'}.`
        ))
        return
      }

      resolve(result)
    })
  })
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
      readline.question('Broadcast this transfer? [y/N] '),
      closed
    ])
    if (typeof answer !== 'string') return false
    const normalized = answer.trim().toLowerCase()
    return normalized === 'y' || normalized === 'yes'
  } finally {
    readline.close()
  }
}

function parseFundArgs (args) {
  if (args.length !== 8 || !args[1]) return null

  const values = {}
  const allowed = new Set(['--from', '--amount', '--network'])
  for (let index = 2; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!allowed.has(flag) || !value || value.startsWith('--') || values[flag]) return null
    values[flag] = value
  }

  if (!values['--from'] || !values['--amount'] || !values['--network']) return null
  return {
    wallet: args[1],
    sourceWallet: values['--from'],
    amount: values['--amount'],
    network: values['--network']
  }
}

export async function main (args, options = {}) {
  const output = options.output ?? console

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    output.log(HELP)
    return 0
  }

  const isCreate = args.length === 1 && args[0] === 'create'
  const isList = args[0] === 'list'
  const isUnlock = args[0] === 'unlock'
  const isAddress = args[0] === 'address'
  const isFund = args[0] === 'fund'

  if (!isCreate && !isList && !isUnlock && !isAddress && !isFund) {
    output.error(`Unknown command: ${args.join(' ')}`)
    output.error('Run `ration help` for usage.')
    return 1
  }

  if (isList) {
    if (
      args.length !== 1 &&
      (args.length !== 3 || args[1] !== '--network' || !args[2])
    ) {
      output.error(LIST_USAGE)
      return 1
    }

    const network = args[2] ?? DEFAULT_LIST_NETWORK
    let wallets
    try {
      wallets = await (options.runWdkWalletList ?? runWdkWalletList)()
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletListingError) {
        output.error(`Wallet listing failed. ${error.message}`)
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    const rationWallets = wallets.filter((wallet) => isRationWalletName(wallet.name))
    if (rationWallets.length === 0) {
      output.log('No Ration wallets found.')
      return 0
    }

    const addresses = new Map()
    const balances = new Map()
    for (const wallet of rationWallets) {
      if (!wallet.unlocked) continue

      try {
        const result = await (options.runWdkGetAddress ?? runWdkGetAddress)(wallet.name, network)
        addresses.set(wallet.name, result.address)
      } catch (error) {
        if (error instanceof WdkCliUnavailableError) {
          output.error('Ration could not find or start the official WDK CLI.')
          output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
          return 1
        }

        if (error instanceof WalletAddressError) {
          if (error.wdkCode === 'NETWORK_NOT_SUPPORTED') {
            output.error(`Network '${network}' is not supported by the installed WDK CLI.`)
          } else if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
            output.error(`Ration wallet '${wallet.name}' was locked before its address could be resolved.`)
            output.error('Run `ration list` again to refresh wallet status.')
          } else {
            output.error(`Could not resolve address for '${wallet.name}'. ${error.message}`)
          }
          return error.signal === 'SIGINT' ? 130 : 1
        }

        throw error
      }

      try {
        const result = await (options.runWdkGetUsdtBalance ?? runWdkGetUsdtBalance)(wallet.name, network)
        balances.set(wallet.name, result.formatted)
      } catch (error) {
        if (error instanceof WdkCliUnavailableError) {
          output.error('Ration could not find or start the official WDK CLI.')
          output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
          return 1
        }

        if (error instanceof WalletBalanceError) {
          if (error.wdkCode === 'NETWORK_NOT_SUPPORTED') {
            output.error(`Network '${network}' is not supported by the installed WDK CLI.`)
          } else if (error.wdkCode === 'TOKEN_NOT_SUPPORTED' || error.wdkCode === 'INVALID_TOKEN') {
            output.error(`The official USDT token is not registered for network '${network}'.`)
          } else if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
            output.error(`Ration wallet '${wallet.name}' was locked before its balance could be retrieved.`)
            output.error('Run `ration list` again to refresh wallet status.')
          } else {
            output.error(`Could not retrieve USDT balance for '${wallet.name}'. ${error.message}`)
          }
          return error.signal === 'SIGINT' ? 130 : 1
        }

        throw error
      }
    }

    output.log(`Ration wallets (${network}):`)
    for (const wallet of rationWallets) {
      let status = wallet.unlocked ? 'Unlocked' : 'Locked'
      if (wallet.unlocked && wallet.ttlMs === 0) {
        status += ' (unlimited session)'
      } else if (wallet.unlocked && typeof wallet.ttlRemaining === 'number') {
        status += ` (${Math.ceil(wallet.ttlRemaining / 60000)} min remaining)`
      }
      const address = addresses.get(wallet.name)
      const balance = balances.get(wallet.name)
      output.log('')
      output.log(`  ${wallet.name}`)
      output.log(`    Address  ${address ?? '-'}`)
      output.log(`    Balance  ${balance ?? '-'}`)
      output.log(`    Status   ${status}`)
    }
    return 0
  }

  if (isUnlock) {
    if (args.length !== 2 || !args[1]) {
      output.error(UNLOCK_USAGE)
      return 1
    }

    const wallet = args[1]
    let wallets
    try {
      wallets = await (options.runWdkWalletList ?? runWdkWalletList)()
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletListingError) {
        output.error(`Could not verify Ration wallets. ${error.message}`)
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    const belongsToRation = wallets.some(
      (candidate) => candidate.name === wallet && isRationWalletName(candidate.name)
    )
    if (!belongsToRation) {
      output.error(`Ration wallet '${wallet}' was not found.`)
      output.error('Run `ration list` to see available Ration wallets.')
      return 1
    }

    try {
      await (options.runWdkWalletUnlock ?? runWdkWalletUnlock)(wallet)
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletUnlockError) {
        output.error(`Wallet unlock failed. ${error.message}`)
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    output.log(`Ration wallet '${wallet}' is unlocked for a ${RATION_SESSION_TTL_MINUTES}-minute WDK session.`)
    return 0
  }

  if (isAddress) {
    if (args.length !== 4 || args[2] !== '--network' || !args[1] || !args[3]) {
      output.error(ADDRESS_USAGE)
      return 1
    }

    const wallet = args[1]
    const network = args[3]
    let wallets
    try {
      wallets = await (options.runWdkWalletList ?? runWdkWalletList)()
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletListingError) {
        output.error(`Could not verify Ration wallets. ${error.message}`)
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    const belongsToRation = wallets.some(
      (candidate) => candidate.name === wallet && isRationWalletName(candidate.name)
    )
    if (!belongsToRation) {
      output.error(`Ration wallet '${wallet}' was not found.`)
      output.error('Run `ration list` to see available Ration wallets.')
      return 1
    }

    let result
    try {
      result = await (options.runWdkGetAddress ?? runWdkGetAddress)(wallet, network)
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletAddressError) {
        if (error.wdkCode === 'NETWORK_NOT_SUPPORTED') {
          output.error(`Network '${network}' is not supported by the installed WDK CLI.`)
        } else if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
          output.error(`Ration wallet '${wallet}' must be unlocked before WDK can derive its address.`)
          output.error(`Run \`ration unlock ${wallet}\`, then try again.`)
        } else {
          output.error(`Address lookup failed. ${error.message}`)
        }
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    output.log(`Network: ${result.network}`)
    output.log(`Address: ${result.address}`)
    return 0
  }

  if (isFund) {
    const fund = parseFundArgs(args)
    if (!fund) {
      output.error(FUND_USAGE)
      return 1
    }

    let wallets
    try {
      wallets = await (options.runWdkWalletList ?? runWdkWalletList)()
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletListingError) {
        output.error(`Could not verify WDK wallets. ${error.message}`)
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    const destinationWallet = wallets.find(
      (candidate) => candidate.name === fund.wallet && isRationWalletName(candidate.name)
    )
    if (!destinationWallet) {
      output.error(`Ration wallet '${fund.wallet}' was not found.`)
      output.error('Run `ration list` to see available Ration wallets.')
      return 1
    }

    const sourceWallet = wallets.find((candidate) => candidate.name === fund.sourceWallet)
    if (!sourceWallet) {
      output.error(`Source WDK wallet '${fund.sourceWallet}' was not found.`)
      output.error('Run `wdk wallet list` to see available source wallets.')
      return 1
    }
    if (fund.sourceWallet === fund.wallet) {
      output.error('The source WDK wallet must be different from the destination Ration wallet.')
      return 1
    }
    if (sourceWallet.unlocked === false) {
      output.error(`Source WDK wallet '${fund.sourceWallet}' is locked.`)
      output.error(`Unlock it through WDK with \`wdk wallet unlock --name ${fund.sourceWallet}\`, then try again.`)
      return 1
    }

    let addressResult
    try {
      addressResult = await (options.runWdkGetAddress ?? runWdkGetAddress)(fund.wallet, fund.network)
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletAddressError) {
        if (error.wdkCode === 'NETWORK_NOT_SUPPORTED') {
          output.error(`Network '${fund.network}' is not supported by the installed WDK CLI.`)
        } else if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
          output.error(`Ration wallet '${fund.wallet}' must be unlocked before WDK can derive its address.`)
          output.error(`Run \`ration unlock ${fund.wallet}\`, then try again.`)
        } else {
          output.error(`Address lookup failed. ${error.message}`)
        }
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    const transfer = {
      sourceWallet: fund.sourceWallet,
      network: fund.network,
      to: addressResult.address,
      amount: fund.amount,
      dryRun: true
    }
    let preview
    try {
      preview = await (options.runWdkTransfer ?? runWdkTransfer)(transfer)
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletTransferError) {
        if (error.wdkCode === 'INVALID_AMOUNT') {
          output.error(`Amount '${fund.amount}' is not a valid positive USD₮ amount for WDK.`)
        } else if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
          output.error(`Source WDK wallet '${fund.sourceWallet}' is locked.`)
          output.error(`Unlock it through WDK with \`wdk wallet unlock --name ${fund.sourceWallet}\`, then try again.`)
        } else if (error.wdkCode === 'KEY_NOT_FOUND') {
          output.error(`Source WDK wallet '${fund.sourceWallet}' was not found.`)
        } else if (error.wdkCode === 'INSUFFICIENT_BALANCE' || error.wdkCode === 'INSUFFICIENT_FUNDS') {
          output.error(`Source WDK wallet '${fund.sourceWallet}' has insufficient funds for the USD₮ transfer and network fee.`)
        } else if (error.wdkCode === 'NETWORK_NOT_SUPPORTED') {
          output.error(`Network '${fund.network}' is not supported by the installed WDK CLI.`)
        } else if (error.wdkCode === 'TOKEN_NOT_SUPPORTED' || error.wdkCode === 'INVALID_TOKEN') {
          output.error(`The official USDT token is not registered for network '${fund.network}'.`)
        } else {
          output.error(`WDK dry run failed. ${error.message}`)
        }
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    output.log('WDK transaction preview (dry run):')
    output.log(`  Source wallet: ${fund.sourceWallet}`)
    output.log(`  Destination Ration wallet: ${fund.wallet}`)
    output.log(`  Destination address: ${addressResult.address}`)
    output.log(`  Network: ${preview.network}`)
    let amountLine = `  Amount: ${preview.amountFormatted}`
    if (typeof preview.amountUsd === 'number') amountLine += ` (~$${preview.amountUsd.toFixed(2)})`
    output.log(amountLine)
    output.log(`  Token: ${preview.tokenSymbol}${preview.token ? ` (${preview.token})` : ''}`)
    let feeLine = `  Estimated fee: ${preview.estimatedFeeFormatted}`
    if (typeof preview.estimatedFeeUsd === 'number') feeLine += ` (~$${preview.estimatedFeeUsd.toFixed(2)})`
    output.log(feeLine)

    const confirmed = await (options.confirmTransfer ?? confirmTransfer)()
    if (confirmed !== true) {
      output.log('Transfer cancelled. Nothing was broadcast.')
      return 0
    }

    let result
    try {
      result = await (options.runWdkTransfer ?? runWdkTransfer)({ ...transfer, dryRun: false })
    } catch (error) {
      if (error instanceof WdkCliUnavailableError) {
        output.error('Ration could not find or start the official WDK CLI.')
        output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
        return 1
      }

      if (error instanceof WalletTransferError) {
        if (error.wdkCode === 'WALLET_NOT_UNLOCKED' || error.wdkCode === 'WALLET_LOCKED') {
          output.error(`Source WDK wallet '${fund.sourceWallet}' is no longer unlocked.`)
          output.error(`Unlock it through WDK with \`wdk wallet unlock --name ${fund.sourceWallet}\`, then try again.`)
        } else if (error.wdkCode === 'INSUFFICIENT_BALANCE' || error.wdkCode === 'INSUFFICIENT_FUNDS') {
          output.error(`Source WDK wallet '${fund.sourceWallet}' has insufficient funds for the USD₮ transfer and network fee.`)
        } else {
          output.error(`WDK transfer broadcast failed. ${error.message}`)
        }
        return error.signal === 'SIGINT' ? 130 : 1
      }

      throw error
    }

    output.log('USD₮ transfer broadcast through WDK.')
    output.log(`Transaction ID: ${result.txHash}`)
    return 0
  }

  const name = (options.createWalletName ?? createWalletName)()
  output.log(`Creating disposable WDK wallet '${name}'...`)

  try {
    await (options.runWdkWalletCreate ?? runWdkWalletCreate)(name)
  } catch (error) {
    if (error instanceof WdkCliUnavailableError) {
      output.error('Ration could not find or start the official WDK CLI.')
      output.error('Run `npm install` to install @tetherto/wdk-cli, then try again.')
      return 1
    }

    if (error instanceof WalletCreationError) {
      output.error(`Wallet creation failed. ${error.message}`)
      return error.signal === 'SIGINT' ? 130 : 1
    }

    throw error
  }

  output.log(`Disposable wallet '${name}' now exists and is managed by WDK.`)
  output.log('Run `ration list` to see Ration wallets.')
  return 0
}
