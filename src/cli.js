import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HELP = `Usage: ration <command> [options]

Commands:
  create    Create a disposable wallet managed by WDK
  list      List disposable wallets created by Ration
  unlock    Unlock a Ration wallet for a WDK session
  address   Get a Ration wallet address for a network
  help      Show this help`

const ADDRESS_USAGE = 'Usage: ration address <wallet> --network <network>'
const UNLOCK_USAGE = 'Usage: ration unlock <wallet>'

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

export class WalletUnlockError extends Error {
  constructor (code, signal) {
    super(signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${code}.`)
    this.code = code
    this.signal = signal
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
        [wdkCliPath, 'wallet', 'unlock', '--name', name],
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

export async function main (args, options = {}) {
  const output = options.output ?? console

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    output.log(HELP)
    return 0
  }

  const isCreate = args.length === 1 && args[0] === 'create'
  const isList = args.length === 1 && args[0] === 'list'
  const isUnlock = args[0] === 'unlock'
  const isAddress = args[0] === 'address'

  if (!isCreate && !isList && !isUnlock && !isAddress) {
    output.error(`Unknown command: ${args.join(' ')}`)
    output.error('Run `ration help` for usage.')
    return 1
  }

  if (isList) {
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

    output.log('Ration wallets:')
    for (const wallet of rationWallets) output.log(`  ${wallet.name}`)
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

    output.log(`Ration wallet '${wallet}' is unlocked for the WDK session.`)
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
