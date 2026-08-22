import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import {
  CommandLaunchError,
  WalletLockError,
  WalletTransferError,
  WalletUnlockError,
  confirmTransfer,
  createWdkOutputFilter,
  createWalletName,
  isRationWalletName,
  main,
  resolveWdkNetwork,
  runRequestedCommand,
  runWdkGetAddress,
  runWdkGetUsdtBalance,
  runWdkTransfer,
  runWdkWalletCreate,
  runWdkWalletList,
  runWdkWalletLock,
  runWdkWalletLockAll,
  runWdkWalletUnlock
} from '../src/cli.js'

function captureOutput () {
  const logs = []
  const errors = []
  return {
    logs,
    errors,
    output: {
      log: (line) => logs.push(line),
      error: (line) => errors.push(line)
    }
  }
}

function jsonChild (result, exitCode = 0) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  queueMicrotask(() => {
    child.stdout.end(JSON.stringify(result))
    child.stderr.end()
    child.emit('close', exitCode, null)
  })
  return child
}

function preview (to = '0xsandbox') {
  return {
    network: 'smart-account-sepolia',
    to,
    amountFormatted: '5 USDT',
    tokenSymbol: 'USDT',
    estimatedFee: '100000',
    estimatedFeeFormatted: '0.1 USDT'
  }
}

test('generates short single-token sandbox identifiers', () => {
  const name = createWalletName('a31f0000-0000-0000-0000-000000000000')
  assert.equal(name, 'rationa31f')
  assert.equal(isRationWalletName(name), true)
  assert.equal(isRationWalletName('ration-a31f'), false)
  assert.equal(isRationWalletName('rationtreasury'), false)
})

test('maps the friendly Sepolia name to the configured account environment', () => {
  assert.equal(resolveWdkNetwork('sepolia'), 'smart-account-sepolia')
  assert.equal(resolveWdkNetwork('smart-account-sepolia'), 'smart-account-sepolia')
})

test('delegates secret-bearing wallet creation directly to the official CLI terminal', async () => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stdout.setEncoding = () => {}
  let invocation
  const result = runWdkWalletCreate('rationtreasury', {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      return child
    }
  })
  child.emit('close', 0, null)
  await result
  assert.deepEqual(invocation, [
    process.execPath,
    ['/wdk.mjs', 'wallet', 'create', '--name', 'rationtreasury'],
    { stdio: ['inherit', 'pipe', 'inherit'] }
  ])
})

test('delegates secret-bearing unlock directly to the official CLI terminal', async () => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stdout.setEncoding = () => {}
  let invocation
  const result = runWdkWalletUnlock('rationtreasury', {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      return child
    }
  })
  child.emit('close', 0, null)
  await result
  assert.deepEqual(invocation, [
    process.execPath,
    ['/wdk.mjs', 'wallet', 'unlock', '--name', 'rationtreasury', '--ttl', '5'],
    { stdio: ['inherit', 'pipe', 'inherit'] }
  ])
})

test('filters WDK session noise and its trailing blank from inherited output', () => {
  const written = []
  const filter = createWdkOutputFilter((line) => written.push(line))
  filter("✔ Wallet 'rationtreasury' unlocked\n")
  filter('\n')
  filter('  Session locks after 5 minutes\n')
  filter('  Run `wdk wallet lock --name rationtreasury` to end session\n')
  filter('\n')
  filter('Next output\n')
  assert.deepEqual(written, [
    "✔ Wallet 'rationtreasury' unlocked\n",
    '\n',
    'Next output\n'
  ])
})

test('streams masked WDK passphrase prompts before a newline arrives', () => {
  const written = []
  const filter = createWdkOutputFilter((text) => written.push(text))
  filter("? Enter passphrase of 'rationtreasury' wallet to unlock: [input is masked]")
  assert.deepEqual(written, [
    "? Enter passphrase of 'rationtreasury' wallet to unlock: [input is masked]"
  ])
})

function promptChild (writes) {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.stdin = {
    write: (value) => writes.push(value)
  }
  return child
}

const ANSWER_DELAY_MS = 250

test('empty-passphrase creation pipes output and answers both passphrase prompts', async () => {
  const writes = []
  let invocation
  let child
  const result = runWdkWalletCreate('rationtreasury', {
    emptyPassphrase: true,
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      child = promptChild(writes)
      return child
    }
  })
  child.stdout.emit('data', '? Passphrase (empty for none):')
  await new Promise((resolve) => setTimeout(resolve, ANSWER_DELAY_MS))
  child.stdout.emit('data', '? Confirm passphrase:')
  await new Promise((resolve) => setTimeout(resolve, ANSWER_DELAY_MS))
  child.emit('close', 0, null)
  await result
  assert.deepEqual(invocation.slice(0, 2), [
    process.execPath,
    ['/wdk.mjs', 'wallet', 'create', '--name', 'rationtreasury']
  ])
  assert.equal(invocation[2].stdio.join(','), 'pipe,pipe,inherit')
  assert.deepEqual(writes, ['\n', '\n'])
})

test('empty-passphrase unlock answers its single passphrase prompt', async () => {
  const writes = []
  let invocation
  let child
  const result = runWdkWalletUnlock('rationtreasury', {
    emptyPassphrase: true,
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      child = promptChild(writes)
      return child
    }
  })
  child.stdout.emit('data', "? Enter passphrase of 'rationtreasury' wallet to unlock:")
  await new Promise((resolve) => setTimeout(resolve, ANSWER_DELAY_MS))
  child.emit('close', 0, null)
  await result
  assert.equal(invocation[1].includes('--ttl'), true)
  assert.deepEqual(writes, ['\n'])
})

test("setup --insecure creates and unlocks the treasury without a passphrase", async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  let listCalls = 0
  const exitCode = await main(['setup', '--insecure'], {
    output,
    runWdkWalletList: async () => {
      listCalls++
      return listCalls === 1 ? [] : [{ name: 'rationtreasury', unlocked: false }]
    },
    runWdkWalletCreate: async (name, options) => events.push(['create', name, options]),
    runWdkWalletUnlock: async (name, options) => events.push(['unlock', name, options]),
    runWdkGetAddress: async (name, network) => ({ address: '0xtreasury', network }),
    runWdkWalletLock: async (name) => events.push(['lock', name])
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(events, [
    ['create', 'rationtreasury', { emptyPassphrase: true }],
    ['unlock', 'rationtreasury', { emptyPassphrase: true }],
    ['lock', 'rationtreasury']
  ])
  assert.equal(logs.some((line) => line.includes('WITHOUT a passphrase')), true)
})

test('plain setup never passes emptyPassphrase to WDK', async () => {
  const seen = []
  await main(['setup'], {
    output: captureOutput().output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkWalletUnlock: async (name, options) => seen.push(['unlock', options]),
    runWdkWalletLock: async () => {}
  })
  assert.deepEqual(seen, [['unlock', {}]])
})

test('uses structured official CLI output for wallet listing and locking', async () => {
  const invocations = []
  const options = {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocations.push(args)
      if (args[1][2] === 'list') {
        return jsonChild({ wallets: [{ name: 'rationtreasury', unlocked: false }], count: 1 })
      }
      return jsonChild({ wallet: 'rationtreasury', locked: true, alreadyLocked: true })
    }
  }
  assert.deepEqual(await runWdkWalletList(options), [{ name: 'rationtreasury', unlocked: false }])
  assert.equal((await runWdkWalletLock('rationtreasury', options)).locked, true)
  assert.deepEqual(invocations.map((call) => call[1]), [
    ['/wdk.mjs', 'wallet', 'list', '--json'],
    ['/wdk.mjs', 'wallet', 'lock', '--name', 'rationtreasury', '--json']
  ])
})

test('uses the official all-wallet lock command', async () => {
  let invocation
  const result = await runWdkWalletLockAll({
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocation = args
      return jsonChild({ locked: true, all: true })
    }
  })
  assert.equal(result.locked, true)
  assert.deepEqual(invocation, [
    process.execPath,
    ['/wdk.mjs', 'wallet', 'lock', '--all', '--json'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  ])
})

test('launches the requested command directly with inherited terminal streams', async () => {
  const child = new EventEmitter()
  let invocation
  const previousPassphrase = process.env.WDK_PASSPHRASE
  process.env.WDK_PASSPHRASE = 'must-not-leak'
  try {
    const resultPromise = runRequestedCommand('claude', ['--model', 'sonnet'], {
      spawnProcess: (...args) => {
        invocation = args
        return child
      }
    })
    child.emit('close', 7, null)
    assert.deepEqual(await resultPromise, { code: 7, signal: null })
    assert.equal(invocation[0], 'claude')
    assert.deepEqual(invocation[1], ['--model', 'sonnet'])
    assert.equal(invocation[2].stdio, 'inherit')
    assert.equal('WDK_PASSPHRASE' in invocation[2].env, false)
  } finally {
    if (previousPassphrase === undefined) delete process.env.WDK_PASSPHRASE
    else process.env.WDK_PASSPHRASE = previousPassphrase
  }
})

test('uses structured address and balance commands for the default environment', async () => {
  const invocations = []
  const options = {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocations.push(args[1])
      if (args[1][2] === 'address') {
        return jsonChild({ network: 'smart-account-sepolia', address: '0xabc', index: 0 })
      }
      return jsonChild({
        network: 'smart-account-sepolia',
        symbol: 'USDT',
        balance: '42000000',
        formatted: '42 USDT'
      })
    }
  }
  assert.equal((await runWdkGetAddress('rationtreasury', undefined, options)).address, '0xabc')
  assert.equal((await runWdkGetUsdtBalance('rationtreasury', undefined, options)).balance, '42000000')
  assert.deepEqual(invocations, [
    ['/wdk.mjs', 'get', 'address', '--wallet', 'rationtreasury', '--network', 'smart-account-sepolia', '--json'],
    ['/wdk.mjs', 'get', 'balance', '--wallet', 'rationtreasury', '--network', 'smart-account-sepolia', '--token', 'USDT', '--json']
  ])
})

test('runs a structured dry run before a structured transfer', async () => {
  const invocations = []
  const base = {
    sourceWallet: 'rationtreasury',
    network: 'smart-account-sepolia',
    to: '0xsandbox',
    amount: '5'
  }
  const options = {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocations.push(args[1])
      if (args[1].includes('--dry-run')) return jsonChild(preview())
      return jsonChild({
        network: 'smart-account-sepolia',
        to: '0xsandbox',
        txHash: '0xtx'
      })
    }
  }
  await runWdkTransfer({ ...base, dryRun: true }, options)
  await runWdkTransfer({ ...base, dryRun: false }, options)
  assert.equal(invocations[0].includes('--dry-run'), true)
  assert.equal(invocations[1].includes('--dry-run'), false)
  assert.equal(invocations[0].at(-1), '--json')
  assert.equal(invocations[1].at(-1), '--json')
})

test('accepts only explicit transfer confirmation', async () => {
  const yesInput = new PassThrough()
  const yes = confirmTransfer({ input: yesInput, output: new PassThrough() })
  yesInput.end('yes\n')
  assert.equal(await yes, true)

  const closedInput = new PassThrough()
  const closed = confirmTransfer({ input: closedInput, output: new PassThrough() })
  closedInput.end()
  assert.equal(await closed, false)
})

test('setup creates the deterministic treasury, resolves its address, and locks it', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  let listCalls = 0
  const exitCode = await main(['setup'], {
    output,
    runWdkWalletList: async () => {
      listCalls++
      return listCalls === 1 ? [] : [{ name: 'rationtreasury', unlocked: false }]
    },
    runWdkWalletCreate: async (name) => events.push(['create', name]),
    runWdkWalletUnlock: async (name) => events.push(['unlock', name]),
    runWdkGetAddress: async (name, network) => {
      events.push(['address', name, network])
      return { address: '0xtreasury', network }
    },
    runWdkWalletLock: async (name) => events.push(['lock', name])
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(events, [
    ['create', 'rationtreasury'],
    ['unlock', 'rationtreasury'],
    ['address', 'rationtreasury', 'smart-account-sepolia'],
    ['lock', 'rationtreasury']
  ])
  assert.equal(logs.includes('  Address   0xtreasury'), true)
  assert.equal(logs.at(-1), 'Fund this address with test USD₮ before creating a sandbox.')
  assert.equal(logs.some((line) => /EOA|4337|paymaster|smart-account/.test(line)), false)
})

test('setup reuses an existing treasury rather than creating a duplicate', async () => {
  const { logs, output } = captureOutput()
  let created = false
  let locked = false
  const exitCode = await main(['setup'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkWalletCreate: async () => { created = true },
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkWalletLock: async () => { locked = true }
  })
  assert.equal(exitCode, 0)
  assert.equal(created, false)
  assert.equal(locked, true)
  assert.equal(logs[0], 'Ration treasury already exists. Checking its address...')
})

test('commands that need a treasury explain the setup prerequisite', async () => {
  for (const args of [
    ['create', '--budget', '5'],
    ['list'],
    ['fund', 'rationa31f', '--amount', '1'],
    ['run', 'rationa31f', '--ttl', '5', '--', 'agent']
  ]) {
    const { errors, output } = captureOutput()
    const exitCode = await main(args, {
      output,
      runWdkWalletList: async () => []
    })
    assert.equal(exitCode, 1)
    assert.deepEqual(errors, ["Ration is not set up yet. Run 'ration setup' first."])
  }
})

test('create verifies funds, creates a unique sandbox, previews, confirms, funds, and locks both wallets', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  let generated = 0
  const exitCode = await main(['create', '--budget', '5'], {
    output,
    createWalletName: () => generated++ === 0 ? 'rationdead' : 'rationa31f',
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationdead', unlocked: false }
    ],
    runWdkWalletUnlock: async (name) => events.push(['unlock', name]),
    runWdkGetUsdtBalance: async (name, network) => {
      events.push(['balance', name, network])
      return { balance: '42000000', formatted: '42 USDT' }
    },
    runWdkWalletCreate: async (name) => events.push(['create', name]),
    runWdkGetAddress: async (name, network) => {
      events.push(['address', name, network])
      return { address: '0xsandbox' }
    },
    runWdkTransfer: async (input) => {
      events.push([input.dryRun ? 'preview' : 'transfer', input])
      if (input.dryRun) return preview()
      return { network: input.network, to: input.to, txHash: '0xtx' }
    },
    confirmTransfer: async () => {
      events.push(['confirm'])
      return true
    },
    runWdkWalletLock: async (name) => events.push(['lock', name])
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(events.map((event) => event[0]), [
    'unlock', 'balance', 'create', 'unlock', 'address', 'preview', 'confirm', 'transfer', 'lock', 'lock'
  ])
  assert.deepEqual(events.slice(-2), [['lock', 'rationa31f'], ['lock', 'rationtreasury']])
  assert.equal(logs.includes('  Sandbox   rationa31f'), true)
  assert.equal(logs.includes('  Address   0xsandbox'), true)
  assert.equal(logs.includes('  Balance   5.00 USDT'), true)
  assert.equal(logs.includes('  Status    locked'), true)
  assert.equal(logs.some((line) => /EOA|4337|paymaster|smart-account/.test(line)), false)
})

test('create checks the treasury balance before creating a sandbox', async () => {
  const { errors, output } = captureOutput()
  let created = false
  const locks = []
  const exitCode = await main(['create', '--budget', '5'], {
    output,
    createWalletName: () => 'rationa31f',
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    runWdkWalletUnlock: async () => {},
    runWdkGetUsdtBalance: async () => ({ balance: '4999999', formatted: '4.999999 USDT' }),
    runWdkWalletCreate: async () => { created = true },
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 1)
  assert.equal(created, false)
  assert.deepEqual(locks, ['rationtreasury'])
  assert.equal(errors[0], 'The treasury needs at least 5.00 USDT for this sandbox.')
})

test('create leaves a declined sandbox empty and locks both wallets', async () => {
  const { logs, output } = captureOutput()
  const locks = []
  let broadcasts = 0
  const exitCode = await main(['create', '--budget', '1'], {
    output,
    createWalletName: () => 'rationa31f',
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkGetUsdtBalance: async () => ({ balance: '10000000', formatted: '10 USDT' }),
    runWdkWalletCreate: async () => {},
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xsandbox' }),
    runWdkTransfer: async (input) => {
      if (!input.dryRun) broadcasts++
      return preview()
    },
    confirmTransfer: async () => false,
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 0)
  assert.equal(broadcasts, 0)
  assert.deepEqual(locks, ['rationa31f', 'rationtreasury'])
  assert.equal(logs.at(-1), "Sandbox 'rationa31f' was created empty and locked. Nothing was broadcast.")
})

test('create locks both wallets when funding fails', async () => {
  const { errors, output } = captureOutput()
  const locks = []
  const exitCode = await main(['create', '--budget', '5'], {
    output,
    createWalletName: () => 'rationa31f',
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkGetUsdtBalance: async () => ({ balance: '50000000', formatted: '50 USDT' }),
    runWdkWalletCreate: async () => {},
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xsandbox' }),
    runWdkTransfer: async () => {
      throw new WalletTransferError('dry-run', 1, null, 'token balance lower than allowance', 'TRANSACTION_CREATION_FAILED')
    },
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 1)
  assert.deepEqual(locks, ['rationa31f', 'rationtreasury'])
  assert.equal(errors[0], 'The treasury does not have enough USD₮ for this budget and its transaction fee.')
})

test('a lock failure prevents create from claiming success', async () => {
  const { logs, errors, output } = captureOutput()
  const exitCode = await main(['create', '--budget', '1'], {
    output,
    createWalletName: () => 'rationa31f',
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkGetUsdtBalance: async () => ({ balance: '10000000', formatted: '10 USDT' }),
    runWdkWalletCreate: async () => {},
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xsandbox' }),
    runWdkTransfer: async (input) => input.dryRun ? preview() : ({ txHash: '0xtx' }),
    confirmTransfer: async () => true,
    runWdkWalletLock: async (name) => {
      if (name === 'rationtreasury') throw new WalletLockError(1, null, 'failed')
    }
  })
  assert.equal(exitCode, 1)
  assert.equal(logs.includes('Sandbox created'), false)
  assert.equal(errors.includes("Security cleanup failed: 'rationtreasury' could not be locked."), true)
})

test('default list never unlocks wallets and never asks for a passphrase', async () => {
  const { logs, errors, output } = captureOutput()
  const calls = []
  const exitCode = await main(['list'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'personal', unlocked: true },
      { name: 'rationa31f', unlocked: false },
      { name: 'rationc912', unlocked: true }
    ],
    runWdkWalletUnlock: async (name) => calls.push(['unlock', name]),
    runWdkGetUsdtBalance: async () => { throw new Error('should not read balances') },
    runWdkGetAddress: async (name) => calls.push(['address', name]),
    runWdkWalletLock: async (name) => calls.push(['lock', name])
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(calls, [])
  assert.deepEqual(logs, [
    'Ration',
    '',
    'Treasury',
    '  hidden      locked',
    '',
    'Sandboxes',
    '  rationa31f   hidden      locked',
    '  rationc912   hidden      active',
    '',
    '  ration list --balances   Reveal balances'
  ])
})

test('unlocked sandboxes show their remaining session time', async () => {
  const { logs, output } = captureOutput()
  const exitCode = await main(['list'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'ration8c42', unlocked: true, ttlMs: 300000, ttlRemaining: 479000 }
    ],
    runWdkWalletUnlock: async () => {},
    runWdkGetUsdtBalance: async () => { throw new Error('should not read balances') },
    runWdkGetAddress: async () => { throw new Error('should not read addresses') },
    runWdkWalletLock: async () => {}
  })
  assert.equal(exitCode, 0)
  assert.equal(logs.includes('  ration8c42   hidden      active · 8m'), true)
})

test('list --balances unlocks each managed wallet and returns it to locked state', async () => {
  const { logs, errors, output } = captureOutput()
  const unlocks = []
  const locks = []
  const balances = {
    rationtreasury: '42000000',
    rationa31f: '5000000',
    rationc912: '2000000'
  }
  const exitCode = await main(['list', '--balances'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'personal', unlocked: true },
      { name: 'rationa31f', unlocked: false },
      { name: 'rationc912', unlocked: true }
    ],
    runWdkWalletUnlock: async (name) => unlocks.push(name),
    runWdkGetUsdtBalance: async (name) => ({
      balance: balances[name],
      formatted: 'unused'
    }),
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(unlocks, ['rationtreasury', 'rationa31f'])
  assert.deepEqual(locks, ['rationtreasury', 'rationa31f', 'rationc912'])
  assert.deepEqual(logs, [
    'Ration',
    '',
    'Treasury',
    '  42.00 USDT  locked',
    '',
    'Sandboxes',
    '  rationa31f   5.00 USDT   locked',
    '  rationc912   2.00 USDT   active'
  ])
})

test('verbose list adds only Ration addresses', async () => {
  const { logs, output } = captureOutput()
  const exitCode = await main(['list', '--verbose'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationa31f', unlocked: true }
    ],
    runWdkGetAddress: async (name) => ({ address: `0x${name}` })
  })
  assert.equal(exitCode, 0)
  assert.equal(logs.filter((line) => line.includes('0x')).length, 1)
  assert.equal(logs.includes('    0xrationa31f'), true)
})

test('verbose list resolves addresses without unlocking when --balances is passed', async () => {
  const { logs, output } = captureOutput()
  const unlocks = []
  const locks = []
  const exitCode = await main(['list', '--verbose', '--balances'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationa31f', unlocked: false }
    ],
    runWdkWalletUnlock: async (name) => unlocks.push(name),
    runWdkGetUsdtBalance: async () => ({ balance: '1000000', formatted: 'unused' }),
    runWdkGetAddress: async (name) => ({ address: `0x${name}` }),
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(unlocks, ['rationtreasury', 'rationa31f'])
  assert.deepEqual(locks, ['rationtreasury', 'rationa31f'])
  assert.equal(logs.includes('  1.00 USDT   locked'), true)
  assert.equal(logs.includes('    0xrationtreasury'), false)
  assert.equal(logs.includes('    0xrationa31f'), true)
})

test('fund tops up from the fixed treasury and locks both wallets', async () => {
  const { logs, output } = captureOutput()
  const transfers = []
  const locks = []
  const exitCode = await main(['fund', 'rationa31f', '--amount', '2'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationa31f', unlocked: false }
    ],
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xsandbox' }),
    runWdkTransfer: async (input) => {
      transfers.push(input)
      return input.dryRun ? preview() : ({ txHash: '0xtx' })
    },
    confirmTransfer: async () => true,
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 0)
  assert.equal(transfers.every((input) => input.sourceWallet === 'rationtreasury'), true)
  assert.deepEqual(locks, ['rationa31f', 'rationtreasury'])
  assert.equal(logs.at(-1), "Sandbox 'rationa31f' funded with 2.00 USDT.")
})

test('run locks all wallets, opens only the selected sandbox, and prints a balance receipt', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  let balanceReads = 0
  const exitCode = await main(['run', 'rationa31f', '--ttl', '10', '--', 'claude', '--model', 'sonnet'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: true },
      { name: 'personal', unlocked: true },
      { name: 'rationa31f', unlocked: false }
    ],
    runWdkWalletLockAll: async () => events.push(['lock-all']),
    runWdkWalletUnlock: async (name, options) => events.push(['unlock', name, options]),
    runWdkGetUsdtBalance: async (name, network) => {
      events.push(['balance', name, network])
      balanceReads++
      return { balance: balanceReads === 1 ? '5000000' : '3760000', formatted: 'unused' }
    },
    runRequestedCommand: async (command, args) => {
      events.push(['command', command, args])
      return { code: 0, signal: null }
    }
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(events, [
    ['lock-all'],
    ['unlock', 'rationa31f', { ttl: 10 }],
    ['balance', 'rationa31f', 'smart-account-sepolia'],
    ['command', 'claude', ['--model', 'sonnet']],
    ['balance', 'rationa31f', 'smart-account-sepolia'],
    ['lock-all']
  ])
  assert.deepEqual(logs, [
    'Ration',
    '',
    'Sandbox   rationa31f',
    'Budget    5.00 USDT',
    'TTL       10m',
    '',
    'Starting claude...',
    '',
    'Session complete',
    '',
    'Spent      1.24 USDT',
    'Remaining  3.76 USDT',
    'Sandbox    locked'
  ])
})

test('run rejects invalid syntax, unrelated wallets, and zero TTL', async () => {
  for (const args of [
    ['run', 'rationa31f', '--ttl', '0', '--', 'claude'],
    ['run', 'rationa31f', '--ttl', '35792', '--', 'claude'],
    ['run', 'rationa31f', '--ttl', '10', 'claude'],
    ['run', 'rationa31f', '--ttl', '10', '--']
  ]) {
    const { errors, output } = captureOutput()
    assert.equal(await main(args, { output }), 1)
    assert.deepEqual(errors, ['Usage: ration run <sandbox> --ttl <minutes> -- <command> [args...]'])
  }

  const { errors, output } = captureOutput()
  const exitCode = await main(['run', 'personal', '--ttl', '10', '--', 'claude'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'personal', unlocked: false }
    ]
  })
  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ["Sandbox 'personal' was not found."])
})

test('run refuses an unfunded sandbox and still locks all wallets', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const exitCode = await main(['run', 'rationa31f', '--ttl', '5', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationa31f', unlocked: false }
    ],
    runWdkWalletLockAll: async () => events.push('lock-all'),
    runWdkWalletUnlock: async () => events.push('unlock'),
    runWdkGetUsdtBalance: async () => {
      events.push('balance')
      return { balance: '0', formatted: '0 USDT' }
    },
    runRequestedCommand: async () => events.push('command')
  })
  assert.equal(exitCode, 1)
  assert.deepEqual(events, ['lock-all', 'unlock', 'balance', 'lock-all'])
  assert.deepEqual(errors, ["Sandbox 'rationa31f' is not funded."])
})

test('run locks the sandbox and reports unavailable totals after a child launch or final balance failure', async () => {
  for (const failure of ['launch', 'balance']) {
    const { logs, errors, output } = captureOutput()
    const events = []
    let balanceReads = 0
    const exitCode = await main(['run', 'rationa31f', '--ttl', '5', '--', 'missing-command'], {
      output,
      runWdkWalletList: async () => [
        { name: 'rationtreasury', unlocked: false },
        { name: 'rationa31f', unlocked: false }
      ],
      runWdkWalletLockAll: async () => events.push('lock-all'),
      runWdkWalletUnlock: async () => events.push('unlock'),
      runWdkGetUsdtBalance: async () => {
        events.push('balance')
        balanceReads++
        if (balanceReads === 2 && failure === 'balance') throw new Error('offline')
        return { balance: '5000000', formatted: '5 USDT' }
      },
      runRequestedCommand: async () => {
        events.push('command')
        if (failure === 'launch') throw new CommandLaunchError('missing-command', new Error('ENOENT'))
        return { code: 9, signal: null }
      }
    })

    assert.equal(exitCode, failure === 'launch' ? 1 : 9)
    assert.equal(events.at(-1), 'lock-all')
    assert.equal(logs.includes('Sandbox    locked'), true)
    if (failure === 'launch') assert.match(errors[0], /Could not start/)
    else {
      assert.equal(errors.includes('Could not read the final sandbox balance through WDK.'), true)
      assert.equal(logs.includes('Spent      unavailable'), true)
    }
  }
})

test('run falls back to locking the selected sandbox if final all-wallet cleanup fails', async () => {
  const { logs, errors, output } = captureOutput()
  let lockAllCalls = 0
  const locks = []
  const exitCode = await main(['run', 'rationa31f', '--ttl', '5', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationa31f', unlocked: false }
    ],
    runWdkWalletLockAll: async () => {
      lockAllCalls++
      if (lockAllCalls === 2) throw new WalletLockError(1, null, 'daemon failed')
    },
    runWdkWalletUnlock: async () => {},
    runWdkGetUsdtBalance: async () => ({ balance: '5000000', formatted: '5 USDT' }),
    runRequestedCommand: async () => ({ code: 0, signal: null }),
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 1)
  assert.deepEqual(locks, ['rationa31f'])
  assert.equal(errors.includes('Security cleanup failed: WDK could not lock all wallets.'), true)
  assert.equal(logs.at(-1), 'Sandbox    locked')
})

test('Ctrl+C stops the interactive child, waits for cleanup, and returns 130', async () => {
  const { output } = captureOutput()
  const events = []
  const child = new EventEmitter()
  child.kill = (signal) => {
    events.push(['kill', signal])
    queueMicrotask(() => child.emit('close', null, signal))
    return true
  }

  const exitCodePromise = main(['run', 'rationa31f', '--ttl', '5', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationa31f', unlocked: false }
    ],
    runWdkWalletLockAll: async () => events.push(['lock-all']),
    runWdkWalletUnlock: async () => events.push(['unlock']),
    runWdkGetUsdtBalance: async () => {
      events.push(['balance'])
      return { balance: '5000000', formatted: '5 USDT' }
    },
    runRequestedCommand: (command, args) => runRequestedCommand(command, args, {
      spawnProcess: () => {
        queueMicrotask(() => process.emit('SIGINT'))
        return child
      }
    })
  })

  assert.equal(await exitCodePromise, 130)
  assert.deepEqual(events, [
    ['lock-all'],
    ['unlock'],
    ['balance'],
    ['kill', 'SIGINT'],
    ['balance'],
    ['lock-all']
  ])
})

test('Ctrl+C force-stops an uncooperative child before wallet cleanup', async () => {
  const { output } = captureOutput()
  const events = []
  const child = new EventEmitter()
  child.kill = (signal) => {
    events.push(['kill', signal])
    if (signal === 'SIGKILL') queueMicrotask(() => child.emit('close', null, signal))
    return true
  }

  const exitCode = await main(['run', 'rationa31f', '--ttl', '5', '--', 'agent'], {
    output,
    signalGraceMs: 1,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationa31f', unlocked: false }
    ],
    runWdkWalletLockAll: async () => events.push(['lock-all']),
    runWdkWalletUnlock: async () => {},
    runWdkGetUsdtBalance: async () => ({ balance: '5000000', formatted: '5 USDT' }),
    runRequestedCommand: (command, args) => runRequestedCommand(command, args, {
      spawnProcess: () => {
        queueMicrotask(() => process.emit('SIGINT'))
        return child
      }
    })
  })

  assert.equal(exitCode, 130)
  assert.deepEqual(events, [
    ['lock-all'],
    ['kill', 'SIGINT'],
    ['kill', 'SIGKILL'],
    ['lock-all']
  ])
})

test('normal create syntax does not accept source-wallet selection', async () => {
  const { errors, output } = captureOutput()
  const exitCode = await main(['create', '--from', 'personal', '--budget', '5'], { output })
  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['Usage: ration create --budget <amount>'])
})

test('advanced unlock refuses to leave the treasury exposed', async () => {
  const { errors, output } = captureOutput()
  let unlocked = false
  const exitCode = await main(['unlock', 'rationtreasury'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    runWdkWalletUnlock: async () => { unlocked = true }
  })
  assert.equal(exitCode, 1)
  assert.equal(unlocked, false)
  assert.deepEqual(errors, [
    'The treasury cannot be left unlocked. Ration only opens it for a specific operation.'
  ])
})

test('cleanup treats an already locked wallet as secure', async () => {
  const { errors, output } = captureOutput()
  const exitCode = await main(['setup'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkWalletLock: async () => {
      throw new WalletLockError(1, null, "Wallet 'rationtreasury' is not unlocked.", 'UNKNOWN_ERROR')
    }
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
})

test('an interrupt waits for wallet cleanup and returns the signal exit code', async () => {
  const { output } = captureOutput()
  const locks = []
  const exitCode = await main(['setup'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    runWdkWalletUnlock: async () => {
      process.emit('SIGINT')
      throw new WalletUnlockError(null, 'SIGINT')
    },
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 130)
  assert.deepEqual(locks, ['rationtreasury'])
})

test('primary help includes the product workflow and hides advanced wallet commands', async () => {
  const { logs, output } = captureOutput()
  assert.equal(await main(['help'], { output }), 0)
  assert.match(logs[0], /setup/)
  assert.match(logs[0], /create --budget/)
  assert.match(logs[0], /run <sandbox>/)
  assert.match(logs[0], /list/)
  assert.doesNotMatch(logs[0], /^\s+(unlock|address|fund)\b/m)
})
