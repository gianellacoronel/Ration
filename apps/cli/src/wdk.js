import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { NETWORK, SESSION_TTL_MINUTES, TOKEN } from './config.js'
import {
  WalletAddressError,
  WalletBalanceError,
  WalletCreationError,
  WalletListingError,
  WalletLockError,
  WalletTransferError,
  WalletUnlockError,
  WdkConfigError,
  WdkCliUnavailableError
} from './errors.js'
import { activeChildren } from './processes.js'

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

const WDK_SESSION_NOISE = /(?:Session (?:locks after|timer reset|will not expire)|Run `wdk wallet lock )/

export function createWdkOutputFilter (write, { showPrompts = true } = {}) {
  let pending = ''
  let suppressBlank = false
  return (chunk) => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop()
    for (const line of lines) {
      if (WDK_SESSION_NOISE.test(line)) {
        suppressBlank = true
        continue
      }
      if (suppressBlank && line.trim() === '') {
        suppressBlank = false
        continue
      }
      suppressBlank = false
      write(`${line}\n`)
    }
    // Inquirer's masked prompt redraws without a newline. Forward each redraw
    // immediately while keeping ordinary WDK output line-buffered for filtering.
    if (/assphrase/i.test(pending)) {
      if (showPrompts) write(pending)
      pending = ''
    }
  }
}

function spawnInteractive (args, ErrorType, promptsToAnswer, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const wdkCliPath = options.wdkCliPath ?? resolveWdkCliPath()
  const automated = promptsToAnswer > 0

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawnProcess(process.execPath, [wdkCliPath, ...args],
        { stdio: [automated ? 'pipe' : 'inherit', 'pipe', 'inherit'] })
    } catch (error) {
      reject(new WdkCliUnavailableError(`Could not start the WDK CLI: ${error.message}`))
      return
    }

    let remaining = promptsToAnswer
    const writeFiltered = createWdkOutputFilter(
      (line) => process.stdout.write(line),
      { showPrompts: !automated }
    )
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      writeFiltered(chunk)
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
  return spawnInteractive(['wallet', 'create', '--name', name], WalletCreationError,
    emptyPassphrase ? 2 : 0, rest)
}

export function runWdkGetNetworkConfig (network = NETWORK, options = {}) {
  return spawnJson(
    ['config', 'get', '--network', network],
    WdkConfigError,
    (result) => result?.network === network && result?.config !== null &&
      typeof result?.config === 'object' && !Array.isArray(result.config),
    options
  ).then((result) => result.config)
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
  const args = ['wallet', 'unlock', '--name', name, '--ttl', String(SESSION_TTL_MINUTES)]
  const { emptyPassphrase, ...rest } = options
  return spawnInteractive(args, WalletUnlockError, emptyPassphrase ? 1 : 0, rest)
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
