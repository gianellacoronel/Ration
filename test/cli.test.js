import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import {
  WalletAddressError,
  WalletCreationError,
  WalletListingError,
  WdkCliUnavailableError,
  createWalletName,
  isRationWalletName,
  main,
  resolveWdkCliPath,
  runWdkGetAddress,
  runWdkWalletCreate,
  runWdkWalletList
} from '../src/cli.js'

test('creates a valid, identifiable WDK wallet name', () => {
  const name = createWalletName(
    new Date('2026-08-22T14:30:12.123Z'),
    'a1b2c3d4-0000-0000-0000-000000000000'
  )

  assert.equal(name, 'ration-20260822T143012123-a1b2c3d4')
  assert.match(name, /^[a-zA-Z0-9_-]+$/)
  assert.equal(isRationWalletName(name), true)
})

test('delegates creation to the official WDK command without capturing streams', async () => {
  const child = new EventEmitter()
  let invocation

  const promise = runWdkWalletCreate('ration-test', {
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      return child
    }
  })

  child.emit('close', 0, null)
  await promise

  assert.deepEqual(invocation, [
    process.execPath,
    ['/installed/wdk.mjs', 'wallet', 'create', '--name', 'ration-test'],
    { stdio: 'inherit' }
  ])
})

test('reports a failed WDK wallet command', async () => {
  const child = new EventEmitter()
  const promise = runWdkWalletCreate('ration-test', {
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: () => child
  })

  child.emit('close', 1, null)

  await assert.rejects(promise, WalletCreationError)
})

test('gets wallets from the official WDK JSON listing', async () => {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  let invocation

  const promise = runWdkWalletList({
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      return child
    }
  })

  child.stdout.end(JSON.stringify({
    wallets: [
      { name: 'ration-20260822T143012123-a1b2c3d4', default: true, unlocked: false },
      { name: 'personal', default: false, unlocked: false }
    ],
    count: 2
  }))
  child.stderr.end()
  child.emit('close', 0, null)

  assert.deepEqual(await promise, [
    { name: 'ration-20260822T143012123-a1b2c3d4', default: true, unlocked: false },
    { name: 'personal', default: false, unlocked: false }
  ])
  assert.deepEqual(invocation, [
    process.execPath,
    ['/installed/wdk.mjs', 'wallet', 'list', '--json'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  ])
})

test('reports failed or invalid WDK wallet listings', async () => {
  const failedChild = new EventEmitter()
  failedChild.stdout = new PassThrough()
  failedChild.stderr = new PassThrough()
  const failed = runWdkWalletList({
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: () => failedChild
  })

  failedChild.emit('close', 1, null)
  await assert.rejects(failed, WalletListingError)

  const invalidChild = new EventEmitter()
  invalidChild.stdout = new PassThrough()
  invalidChild.stderr = new PassThrough()
  const invalid = runWdkWalletList({
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: () => invalidChild
  })

  invalidChild.stdout.end('not json')
  invalidChild.emit('close', 0, null)
  await assert.rejects(invalid, /unexpected wallet list/)
})

test('gets an address from the official WDK command with an explicit wallet and network', async () => {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  let invocation

  const promise = runWdkGetAddress('ration-wallet', 'sepolia', {
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      return child
    }
  })

  child.stdout.end(JSON.stringify({
    network: 'sepolia',
    index: 0,
    address: '0x1234567890abcdef'
  }))
  child.stderr.end()
  child.emit('close', 0, null)

  assert.deepEqual(await promise, {
    network: 'sepolia',
    index: 0,
    address: '0x1234567890abcdef'
  })
  assert.deepEqual(invocation, [
    process.execPath,
    [
      '/installed/wdk.mjs',
      'get',
      'address',
      '--wallet',
      'ration-wallet',
      '--network',
      'sepolia',
      '--json'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  ])
})

test('preserves structured WDK address failures', async () => {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  const promise = runWdkGetAddress('ration-wallet', 'unknown', {
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: () => child
  })

  child.stdout.end(JSON.stringify({
    error: "Network 'unknown' is not supported.",
    code: 'NETWORK_NOT_SUPPORTED'
  }))
  child.stderr.end()
  child.emit('close', 1, null)

  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof WalletAddressError, true)
    assert.equal(error.wdkCode, 'NETWORK_NOT_SUPPORTED')
    assert.equal(error.message, "Network 'unknown' is not supported.")
    return true
  })
})

test('reports an unavailable WDK installation', () => {
  assert.throws(
    () => resolveWdkCliPath(() => { throw new Error('missing') }),
    WdkCliUnavailableError
  )
})

test('prints confirmation only after WDK succeeds', async () => {
  const lines = []
  const output = {
    log: (line) => lines.push(line),
    error: (line) => lines.push(line)
  }

  const exitCode = await main(['create'], {
    output,
    createWalletName: () => 'ration-test',
    runWdkWalletCreate: async () => {}
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(lines, [
    "Creating disposable WDK wallet 'ration-test'...",
    "Disposable wallet 'ration-test' now exists and is managed by WDK.",
    'Run `ration list` to see Ration wallets.'
  ])
})

test('does not print a success confirmation when WDK fails', async () => {
  const lines = []
  const output = {
    log: (line) => lines.push(line),
    error: (line) => lines.push(line)
  }

  const exitCode = await main(['create'], {
    output,
    createWalletName: () => 'ration-test',
    runWdkWalletCreate: async () => { throw new WalletCreationError(1, null) }
  })

  assert.equal(exitCode, 1)
  assert.equal(lines.some((line) => line.includes('now exists')), false)
})

test('handles an unavailable WDK CLI without exposing internals', async () => {
  const errors = []
  const output = {
    log: () => {},
    error: (line) => errors.push(line)
  }

  const exitCode = await main(['create'], {
    output,
    createWalletName: () => 'ration-test',
    runWdkWalletCreate: async () => { throw new WdkCliUnavailableError('missing') }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, [
    'Ration could not find or start the official WDK CLI.',
    'Run `npm install` to install @tetherto/wdk-cli, then try again.'
  ])
})

test('lists only wallets created with the Ration naming convention', async () => {
  const lines = []
  const output = {
    log: (line) => lines.push(line),
    error: (line) => lines.push(line)
  }

  const exitCode = await main(['list'], {
    output,
    runWdkWalletList: async () => [
      { name: 'ration-20260822T143012123-a1b2c3d4' },
      { name: 'personal' },
      { name: 'ration-not-created-by-ration' },
      { name: 'ration-20260822T143013456-0123abcd' }
    ]
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(lines, [
    'Ration wallets:',
    '  ration-20260822T143012123-a1b2c3d4',
    '  ration-20260822T143013456-0123abcd'
  ])
})

test('shows an empty state when WDK has no Ration wallets', async () => {
  const lines = []
  const exitCode = await main(['list'], {
    output: {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line)
    },
    runWdkWalletList: async () => [{ name: 'personal' }]
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(lines, ['No Ration wallets found.'])
})

test('handles a WDK listing failure cleanly', async () => {
  const errors = []
  const exitCode = await main(['list'], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    },
    runWdkWalletList: async () => { throw new WalletListingError(1, null) }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['Wallet listing failed. WDK exited with code 1.'])
})

test('prints the WDK-derived address and network for a Ration wallet', async () => {
  const lines = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'
  let addressRequest

  const exitCode = await main(['address', wallet, '--network', 'sepolia'], {
    output: {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line)
    },
    runWdkWalletList: async () => [{ name: wallet }],
    runWdkGetAddress: async (...args) => {
      addressRequest = args
      return { network: 'sepolia', index: 0, address: '0x1234567890abcdef' }
    }
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(addressRequest, [wallet, 'sepolia'])
  assert.deepEqual(lines, [
    'Network: sepolia',
    'Address: 0x1234567890abcdef'
  ])
})

test('rejects wallets that do not belong to Ration', async () => {
  const errors = []
  let requestedAddress = false

  const exitCode = await main(['address', 'personal', '--network', 'sepolia'], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    },
    runWdkWalletList: async () => [{ name: 'personal' }],
    runWdkGetAddress: async () => { requestedAddress = true }
  })

  assert.equal(exitCode, 1)
  assert.equal(requestedAddress, false)
  assert.deepEqual(errors, [
    "Ration wallet 'personal' was not found.",
    'Run `ration list` to see available Ration wallets.'
  ])
})

test('explains the WDK unlock requirement for address lookup', async () => {
  const errors = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'

  const exitCode = await main(['address', wallet, '--network', 'sepolia'], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    },
    runWdkWalletList: async () => [{ name: wallet }],
    runWdkGetAddress: async () => {
      throw new WalletAddressError(1, null, 'Wallet is not unlocked.', 'WALLET_NOT_UNLOCKED')
    }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, [
    `Ration wallet '${wallet}' must be unlocked before WDK can derive its address.`,
    `Run \`npm run wdk -- wallet unlock --name ${wallet}\`, then try again.`
  ])
})

test('reports networks rejected by WDK', async () => {
  const errors = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'

  const exitCode = await main(['address', wallet, '--network', 'unknown'], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    },
    runWdkWalletList: async () => [{ name: wallet }],
    runWdkGetAddress: async () => {
      throw new WalletAddressError(1, null, 'Unsupported.', 'NETWORK_NOT_SUPPORTED')
    }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ["Network 'unknown' is not supported by the installed WDK CLI."])
})

test('requires the complete address command syntax', async () => {
  const errors = []
  const exitCode = await main(['address', 'ration-wallet'], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['Usage: ration address <wallet> --network <network>'])
})
