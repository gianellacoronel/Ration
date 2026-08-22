import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import {
  WalletAddressError,
  WalletCreationError,
  WalletListingError,
  WalletTransferError,
  WalletUnlockError,
  WdkCliUnavailableError,
  confirmTransfer,
  createWalletName,
  isRationWalletName,
  main,
  resolveWdkCliPath,
  runWdkGetAddress,
  runWdkTransfer,
  runWdkWalletCreate,
  runWdkWalletList,
  runWdkWalletUnlock
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

test('delegates unlocking to the official WDK command without capturing streams', async () => {
  const child = new EventEmitter()
  let invocation

  const promise = runWdkWalletUnlock('ration-wallet', {
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
    ['/installed/wdk.mjs', 'wallet', 'unlock', '--name', 'ration-wallet'],
    { stdio: 'inherit' }
  ])
})

test('reports a failed WDK unlock command', async () => {
  const child = new EventEmitter()
  const promise = runWdkWalletUnlock('ration-wallet', {
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: () => child
  })

  child.emit('close', 1, null)

  await assert.rejects(promise, WalletUnlockError)
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

test('runs the official WDK transfer dry run with explicit wallet, token, and JSON output', async () => {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  let invocation

  const promise = runWdkTransfer({
    sourceWallet: 'treasury',
    network: 'sepolia',
    to: '0x1234567890abcdef',
    amount: '12.50',
    dryRun: true
  }, {
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      return child
    }
  })

  const preview = {
    network: 'sepolia',
    networkName: 'Ethereum Sepolia',
    to: '0x1234567890abcdef',
    amount: '12500000',
    amountFormatted: '12.5 USDT',
    amountUsd: 12.5,
    token: '0xd077A400968890Eacc75cdc901F0356c943e4fDb',
    tokenSymbol: 'USDT',
    estimatedFee: '100000000000000',
    estimatedFeeFormatted: '0.0001 ETH',
    estimatedFeeUsd: 0.25
  }
  child.stdout.end(JSON.stringify(preview))
  child.stderr.end()
  child.emit('close', 0, null)

  assert.deepEqual(await promise, preview)
  assert.deepEqual(invocation, [
    process.execPath,
    [
      '/installed/wdk.mjs',
      'send',
      '--wallet',
      'treasury',
      '--network',
      'sepolia',
      '--to',
      '0x1234567890abcdef',
      '--amount',
      '12.50',
      '--token',
      'USDT',
      '--dry-run',
      '--json'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  ])
})

test('runs the confirmed WDK transfer without dry-run and returns its structured transaction ID', async () => {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  let invocation

  const promise = runWdkTransfer({
    sourceWallet: 'treasury',
    network: 'sepolia',
    to: '0x1234567890abcdef',
    amount: '12.50',
    dryRun: false
  }, {
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      return child
    }
  })

  const result = {
    network: 'sepolia',
    txHash: '0xtransaction',
    from: '0xsource',
    to: '0x1234567890abcdef',
    amount: '12500000',
    amountFormatted: '12.5 USDT',
    fee: '100000000000000',
    feeFormatted: '0.0001 ETH'
  }
  child.stdout.end(JSON.stringify(result))
  child.stderr.end()
  child.emit('close', 0, null)

  assert.deepEqual(await promise, result)
  assert.equal(invocation[1].includes('--dry-run'), false)
  assert.deepEqual(invocation[1], [
    '/installed/wdk.mjs',
    'send',
    '--wallet',
    'treasury',
    '--network',
    'sepolia',
    '--to',
    '0x1234567890abcdef',
    '--amount',
    '12.50',
    '--token',
    'USDT',
    '--json'
  ])
})

test('preserves structured WDK transfer failures and their phase', async () => {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  const promise = runWdkTransfer({
    sourceWallet: 'treasury',
    network: 'sepolia',
    to: '0x1234567890abcdef',
    amount: '999',
    dryRun: true
  }, {
    wdkCliPath: '/installed/wdk.mjs',
    spawnProcess: () => child
  })

  child.stdout.end(JSON.stringify({
    error: 'Insufficient funds for this transaction.',
    code: 'INSUFFICIENT_FUNDS'
  }))
  child.stderr.end('human-readable diagnostic')
  child.emit('close', 1, null)

  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof WalletTransferError, true)
    assert.equal(error.phase, 'dry-run')
    assert.equal(error.wdkCode, 'INSUFFICIENT_FUNDS')
    assert.equal(error.message, 'Insufficient funds for this transaction.')
    return true
  })
})

test('requires an affirmative confirmation and treats closed input as cancellation', async () => {
  const affirmativeInput = new PassThrough()
  const affirmativeOutput = new PassThrough()
  const affirmative = confirmTransfer({ input: affirmativeInput, output: affirmativeOutput })
  affirmativeInput.end('yes\n')
  assert.equal(await affirmative, true)

  const closedInput = new PassThrough()
  const closedOutput = new PassThrough()
  const closed = confirmTransfer({ input: closedInput, output: closedOutput })
  closedInput.end()
  assert.equal(await closed, false)
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
      { name: 'ration-20260822T143012123-a1b2c3d4', unlocked: false },
      { name: 'personal', unlocked: true, ttlMs: 300000, ttlRemaining: 240000 },
      { name: 'ration-not-created-by-ration', unlocked: false },
      {
        name: 'ration-20260822T143013456-0123abcd',
        unlocked: true,
        ttlMs: 300000,
        ttlRemaining: 240000
      }
    ]
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(lines, [
    'Ration wallets:',
    '  ration-20260822T143012123-a1b2c3d4  locked',
    '  ration-20260822T143013456-0123abcd  unlocked (4 min remaining)'
  ])
})

test('shows unlimited WDK sessions without exposing wallet details', async () => {
  const lines = []
  const exitCode = await main(['list'], {
    output: {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line)
    },
    runWdkWalletList: async () => [{
      name: 'ration-20260822T143012123-a1b2c3d4',
      unlocked: true,
      ttlMs: 0,
      ttlRemaining: 0
    }]
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(lines, [
    'Ration wallets:',
    '  ration-20260822T143012123-a1b2c3d4  unlocked (unlimited session)'
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

test('unlocks only a wallet that belongs to Ration', async () => {
  const lines = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'
  let unlockedWallet

  const exitCode = await main(['unlock', wallet], {
    output: {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line)
    },
    runWdkWalletList: async () => [{ name: wallet }, { name: 'personal' }],
    runWdkWalletUnlock: async (name) => { unlockedWallet = name }
  })

  assert.equal(exitCode, 0)
  assert.equal(unlockedWallet, wallet)
  assert.deepEqual(lines, [`Ration wallet '${wallet}' is unlocked for the WDK session.`])
})

test('does not unlock a non-Ration wallet', async () => {
  const errors = []
  let unlocked = false

  const exitCode = await main(['unlock', 'personal'], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    },
    runWdkWalletList: async () => [{ name: 'personal' }],
    runWdkWalletUnlock: async () => { unlocked = true }
  })

  assert.equal(exitCode, 1)
  assert.equal(unlocked, false)
  assert.deepEqual(errors, [
    "Ration wallet 'personal' was not found.",
    'Run `ration list` to see available Ration wallets.'
  ])
})

test('reports a failed wallet unlock cleanly', async () => {
  const errors = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'

  const exitCode = await main(['unlock', wallet], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    },
    runWdkWalletList: async () => [{ name: wallet }],
    runWdkWalletUnlock: async () => { throw new WalletUnlockError(1, null) }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['Wallet unlock failed. WDK exited with code 1.'])
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
    `Run \`ration unlock ${wallet}\`, then try again.`
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

test('requires a wallet for the unlock command', async () => {
  const errors = []
  const exitCode = await main(['unlock'], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['Usage: ration unlock <wallet>'])
})

test('funds a resolved Ration address only after an official dry run and explicit confirmation', async () => {
  const lines = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'
  const destination = '0x1234567890abcdef'
  const transfers = []
  let confirmationRequested = false

  const exitCode = await main([
    'fund',
    wallet,
    '--from',
    'treasury',
    '--amount',
    '12.50',
    '--network',
    'sepolia'
  ], {
    output: {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line)
    },
    runWdkWalletList: async () => [
      { name: wallet, unlocked: true },
      { name: 'treasury', unlocked: true }
    ],
    runWdkGetAddress: async (name, network) => {
      assert.equal(name, wallet)
      assert.equal(network, 'sepolia')
      return { network, address: destination }
    },
    runWdkTransfer: async (input) => {
      transfers.push(input)
      if (input.dryRun) {
        return {
          network: 'sepolia',
          to: destination,
          amountFormatted: '12.5 USDT',
          amountUsd: 12.5,
          token: '0xd077A400968890Eacc75cdc901F0356c943e4fDb',
          tokenSymbol: 'USDT',
          estimatedFee: '100000000000000',
          estimatedFeeFormatted: '0.0001 ETH',
          estimatedFeeUsd: 0.25
        }
      }
      return {
        network: 'sepolia',
        txHash: '0xtransaction',
        from: '0xsource',
        to: destination,
        amountFormatted: '12.5 USDT'
      }
    },
    confirmTransfer: async () => {
      confirmationRequested = true
      assert.equal(transfers.length, 1)
      assert.equal(lines[0], 'WDK transaction preview (dry run):')
      return true
    }
  })

  assert.equal(exitCode, 0)
  assert.equal(confirmationRequested, true)
  assert.deepEqual(transfers, [
    {
      sourceWallet: 'treasury',
      network: 'sepolia',
      to: destination,
      amount: '12.50',
      dryRun: true
    },
    {
      sourceWallet: 'treasury',
      network: 'sepolia',
      to: destination,
      amount: '12.50',
      dryRun: false
    }
  ])
  assert.deepEqual(lines, [
    'WDK transaction preview (dry run):',
    '  Source wallet: treasury',
    `  Destination Ration wallet: ${wallet}`,
    `  Destination address: ${destination}`,
    '  Network: sepolia',
    '  Amount: 12.5 USDT (~$12.50)',
    '  Token: USDT (0xd077A400968890Eacc75cdc901F0356c943e4fDb)',
    '  Estimated fee: 0.0001 ETH (~$0.25)',
    'USD₮ transfer broadcast through WDK.',
    'Transaction ID: 0xtransaction'
  ])
})

test('does not broadcast a funding transfer when confirmation is declined', async () => {
  const lines = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'
  let transferCalls = 0

  const exitCode = await main([
    'fund', wallet, '--from', 'treasury', '--amount', '1', '--network', 'sepolia'
  ], {
    output: {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line)
    },
    runWdkWalletList: async () => [
      { name: wallet, unlocked: true },
      { name: 'treasury', unlocked: true }
    ],
    runWdkGetAddress: async () => ({ network: 'sepolia', address: '0xdestination' }),
    runWdkTransfer: async () => {
      transferCalls++
      return {
        network: 'sepolia',
        to: '0xdestination',
        amountFormatted: '1 USDT',
        tokenSymbol: 'USDT',
        estimatedFee: '1',
        estimatedFeeFormatted: '0.01 ETH'
      }
    },
    confirmTransfer: async () => false
  })

  assert.equal(exitCode, 0)
  assert.equal(transferCalls, 1)
  assert.equal(lines.at(-1), 'Transfer cancelled. Nothing was broadcast.')
  assert.equal(lines.some((line) => line.includes('Transaction ID')), false)
})

test('rejects invalid destination and source wallet names before funding', async () => {
  const rationWallet = 'ration-20260822T143012123-a1b2c3d4'
  let addressRequested = false
  let transferRequested = false

  const invalidDestinationErrors = []
  const invalidDestination = await main([
    'fund', 'personal', '--from', 'treasury', '--amount', '1', '--network', 'sepolia'
  ], {
    output: {
      log: () => {},
      error: (line) => invalidDestinationErrors.push(line)
    },
    runWdkWalletList: async () => [{ name: 'personal' }, { name: 'treasury', unlocked: true }],
    runWdkGetAddress: async () => { addressRequested = true },
    runWdkTransfer: async () => { transferRequested = true }
  })

  assert.equal(invalidDestination, 1)
  assert.deepEqual(invalidDestinationErrors, [
    "Ration wallet 'personal' was not found.",
    'Run `ration list` to see available Ration wallets.'
  ])

  const invalidSourceErrors = []
  const invalidSource = await main([
    'fund', rationWallet, '--from', 'missing', '--amount', '1', '--network', 'sepolia'
  ], {
    output: {
      log: () => {},
      error: (line) => invalidSourceErrors.push(line)
    },
    runWdkWalletList: async () => [{ name: rationWallet }],
    runWdkGetAddress: async () => { addressRequested = true },
    runWdkTransfer: async () => { transferRequested = true }
  })

  assert.equal(invalidSource, 1)
  assert.deepEqual(invalidSourceErrors, [
    "Source WDK wallet 'missing' was not found.",
    'Run `wdk wallet list` to see available source wallets.'
  ])
  assert.equal(addressRequested, false)
  assert.equal(transferRequested, false)
})

test('requires the source WDK wallet to already be unlocked', async () => {
  const errors = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'
  let transferRequested = false

  const exitCode = await main([
    'fund', wallet, '--from', 'treasury', '--amount', '1', '--network', 'sepolia'
  ], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    },
    runWdkWalletList: async () => [
      { name: wallet, unlocked: true },
      { name: 'treasury', unlocked: false }
    ],
    runWdkTransfer: async () => { transferRequested = true }
  })

  assert.equal(exitCode, 1)
  assert.equal(transferRequested, false)
  assert.deepEqual(errors, [
    "Source WDK wallet 'treasury' is locked.",
    'Unlock it through WDK with `wdk wallet unlock --name treasury`, then try again.'
  ])
})

test('rejects using the destination Ration wallet as its own funding source', async () => {
  const errors = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'
  let transferRequested = false

  const exitCode = await main([
    'fund', wallet, '--from', wallet, '--amount', '1', '--network', 'sepolia'
  ], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    },
    runWdkWalletList: async () => [{ name: wallet, unlocked: true }],
    runWdkTransfer: async () => { transferRequested = true }
  })

  assert.equal(exitCode, 1)
  assert.equal(transferRequested, false)
  assert.deepEqual(errors, [
    'The source WDK wallet must be different from the destination Ration wallet.'
  ])
})

test('reports structured WDK funding dry-run failures cleanly', async () => {
  const wallet = 'ration-20260822T143012123-a1b2c3d4'
  const cases = [
    ['INVALID_AMOUNT', "Amount 'bad' is not a valid positive USD₮ amount for WDK."],
    ['INSUFFICIENT_FUNDS', "Source WDK wallet 'treasury' has insufficient funds for the USD₮ transfer and network fee."],
    ['NETWORK_NOT_SUPPORTED', "Network 'sepolia' is not supported by the installed WDK CLI."],
    ['TOKEN_NOT_SUPPORTED', "The official USDT token is not registered for network 'sepolia'."],
    ['NETWORK_ERROR', 'WDK dry run failed. RPC unavailable.']
  ]

  for (const [wdkCode, expected] of cases) {
    const errors = []
    const exitCode = await main([
      'fund', wallet, '--from', 'treasury', '--amount', 'bad', '--network', 'sepolia'
    ], {
      output: {
        log: () => {},
        error: (line) => errors.push(line)
      },
      runWdkWalletList: async () => [
        { name: wallet, unlocked: true },
        { name: 'treasury', unlocked: true }
      ],
      runWdkGetAddress: async () => ({ network: 'sepolia', address: '0xdestination' }),
      runWdkTransfer: async () => {
        throw new WalletTransferError('dry-run', 1, null, 'RPC unavailable.', wdkCode)
      }
    })

    assert.equal(exitCode, 1)
    assert.deepEqual(errors, [expected])
  }
})

test('reports a structured WDK broadcast failure without claiming success', async () => {
  const lines = []
  const wallet = 'ration-20260822T143012123-a1b2c3d4'
  let transferCalls = 0

  const exitCode = await main([
    'fund', wallet, '--from', 'treasury', '--amount', '1', '--network', 'sepolia'
  ], {
    output: {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line)
    },
    runWdkWalletList: async () => [
      { name: wallet, unlocked: true },
      { name: 'treasury', unlocked: true }
    ],
    runWdkGetAddress: async () => ({ network: 'sepolia', address: '0xdestination' }),
    runWdkTransfer: async () => {
      transferCalls++
      if (transferCalls === 1) {
        return {
          network: 'sepolia',
          to: '0xdestination',
          amountFormatted: '1 USDT',
          tokenSymbol: 'USDT',
          estimatedFee: '1',
          estimatedFeeFormatted: '0.01 ETH'
        }
      }
      throw new WalletTransferError('broadcast', 1, null, 'Transaction was rejected.', 'TRANSACTION_FAILED')
    },
    confirmTransfer: async () => true
  })

  assert.equal(exitCode, 1)
  assert.equal(transferCalls, 2)
  assert.equal(lines.at(-1), 'WDK transfer broadcast failed. Transaction was rejected.')
  assert.equal(lines.some((line) => line.includes('Transaction ID')), false)
})

test('requires the complete fund command syntax', async () => {
  const errors = []
  const exitCode = await main(['fund', 'ration-wallet', '--from', 'treasury'], {
    output: {
      log: () => {},
      error: (line) => errors.push(line)
    }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, [
    'Usage: ration fund <wallet> --from <source-wallet> --amount <amount> --network <network>'
  ])
})
