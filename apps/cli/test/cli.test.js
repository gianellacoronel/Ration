import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import {
  WalletBalanceError,
  WalletLockError,
  WalletTransferError,
  WalletUnlockError,
  confirmTransfer,
  createWdkOutputFilter,
  createWalletName,
  isRationWalletName,
  main as cliMain,
  resolveWdkNetwork,
  runRequestedCommand,
  runWdkGetAddress,
  runWdkGetNetworkConfig,
  runWdkGetUsdtBalance,
  runWdkTransfer,
  runWdkWalletCreate,
  runWdkWalletList,
  runWdkWalletLock,
  runWdkWalletLockAll,
  runWdkWalletUnlock
} from '../src/cli.js'

const PAYMASTER_TOKEN_CONFIG = {
  chainId: 11155111,
  provider: 'https://sepolia.gateway.tenderly.co',
  bundlerUrl: 'https://api.candide.dev/public/v3/11155111',
  paymasterUrl: 'https://api.candide.dev/public/v3/11155111',
  paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
  safeModulesVersion: '0.3.0',
  paymasterToken: {
    address: '0xd077a400968890eacc75cdc901f0356c943e4fdb'
  },
  transferMaxFee: 100000
}

function main (args, options = {}) {
  return cliMain(args, {
    runWdkGetNetworkConfig: async () => PAYMASTER_TOKEN_CONFIG,
    ...options
  })
}

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
    estimatedFee: '50000',
    estimatedFeeFormatted: '0.05 USDT'
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

test('setup --insecure creates and unlocks the treasury without a passphrase', async () => {
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

test('reads paymaster configuration through structured official CLI output', async () => {
  const invocations = []
  const config = await runWdkGetNetworkConfig(undefined, {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocations.push(args[1])
      return jsonChild({ network: 'smart-account-sepolia', config: PAYMASTER_TOKEN_CONFIG })
    }
  })

  assert.deepEqual(config, PAYMASTER_TOKEN_CONFIG)
  assert.deepEqual(invocations, [[
    '/wdk.mjs', 'config', 'get', '--network', 'smart-account-sepolia', '--json'
  ]])
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
    ['run', '--budget', '1', '--', 'agent']
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

test('funding fails closed before unlocking when Paymaster Token mode is malformed', async () => {
  const { errors, output } = captureOutput()
  let unlocked = false
  const exitCode = await cliMain(['create', '--budget', '5'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    runWdkGetNetworkConfig: async () => ({
      ...PAYMASTER_TOKEN_CONFIG,
      bundlerUrl: 'https://api.candide.dev/api/v3/11155111/private-key',
      paymasterUrl: 'https://api.candide.dev/api/v3/11155111/private-key',
      isSponsored: true
    }),
    runWdkWalletUnlock: async () => { unlocked = true }
  })

  assert.equal(exitCode, 1)
  assert.equal(unlocked, false)
  assert.match(errors[0], /Paymaster Token mode is not configured/)
  assert.doesNotMatch(errors.join('\n'), /private-key/)
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

test('create quotes the total before rejecting insufficient treasury funds', async () => {
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
    runWdkGetAddress: async () => ({ address: '0xsandbox' }),
    runWdkTransfer: async () => preview(),
    runWdkWalletLock: async (name) => locks.push(name)
  })
  assert.equal(exitCode, 1)
  assert.equal(created, true)
  assert.deepEqual(locks, ['rationa31f', 'rationtreasury'])
  assert.equal(errors[0], 'Insufficient treasury funds: available 4.999999 USDT, required 5.05 USDT.')
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
  assert.equal(errors[0], 'The treasury does not have enough USD₮ for this amount and its gas fee.')
})

test('create rejects a zero-fee quote without confirming or broadcasting', async () => {
  const { errors, output } = captureOutput()
  const locks = []
  let confirmed = false
  let broadcasts = 0
  const exitCode = await main(['create', '--budget', '5'], {
    output,
    createWalletName: () => 'rationa31f',
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkGetUsdtBalance: async () => ({ balance: '50000000', formatted: '50 USDT' }),
    runWdkWalletCreate: async () => {},
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xsandbox' }),
    runWdkTransfer: async (input) => {
      if (!input.dryRun) broadcasts++
      return { ...preview(), estimatedFee: '0' }
    },
    confirmTransfer: async () => { confirmed = true },
    runWdkWalletLock: async (name) => locks.push(name)
  })

  assert.equal(exitCode, 1)
  assert.equal(confirmed, false)
  assert.equal(broadcasts, 0)
  assert.deepEqual(locks, ['rationa31f', 'rationtreasury'])
  assert.deepEqual(errors, ['WDK did not return a valid USD₮ gas quote. Nothing was broadcast.'])
})

test('create rejects a gas quote at or above the WDK safety limit', async () => {
  for (const estimatedFee of ['100000', '2431183']) {
    const { errors, output } = captureOutput()
    const locks = []
    let confirmed = false
    const exitCode = await main(['create', '--budget', '5'], {
      output,
      createWalletName: () => 'rationa31f',
      runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
      runWdkGetUsdtBalance: async () => ({ balance: '50000000', formatted: '50 USDT' }),
      runWdkWalletCreate: async () => {},
      runWdkWalletUnlock: async () => {},
      runWdkGetAddress: async () => ({ address: '0xsandbox' }),
      runWdkTransfer: async () => ({ ...preview(), estimatedFee }),
      confirmTransfer: async () => { confirmed = true },
      runWdkWalletLock: async (name) => locks.push(name)
    })

    assert.equal(exitCode, 1)
    assert.equal(confirmed, false)
    assert.deepEqual(locks, ['rationa31f', 'rationtreasury'])
    assert.match(errors[0], /exceeds the WDK safety limit/)
    assert.equal(errors[1], 'Nothing was broadcast.')
  }
})

test('paymaster failures are redacted and both wallets are locked', async () => {
  const { errors, output } = captureOutput()
  const locks = []
  const providerDetail = 'never-print-this-provider-detail'
  const exitCode = await main(['create', '--budget', '5'], {
    output,
    createWalletName: () => 'rationa31f',
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkGetUsdtBalance: async () => ({ balance: '50000000', formatted: '50 USDT' }),
    runWdkWalletCreate: async () => {},
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xsandbox' }),
    runWdkTransfer: async (input) => {
      if (input.dryRun) return preview()
      throw new WalletTransferError(
        'broadcast',
        1,
        null,
        `Paymaster rejected: ${providerDetail}`,
        'UNKNOWN_ERROR'
      )
    },
    confirmTransfer: async () => true,
    runWdkWalletLock: async (name) => locks.push(name)
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(locks, ['rationa31f', 'rationtreasury'])
  assert.match(errors[0], /USD₮ gas payment failed through Candide/)
  assert.doesNotMatch(errors.join('\n'), new RegExp(providerDetail))
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
  const exitCode = await cliMain(['list', '--balances'], {
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

test('list --balances identifies RPC rejection without exposing provider details', async () => {
  const { errors, output } = captureOutput()
  const locks = []
  const exitCode = await cliMain(['list', '--balances'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    runWdkWalletUnlock: async () => {},
    runWdkGetUsdtBalance: async () => {
      throw new WalletBalanceError(1, null, 'chain is not available on free plan', 'UNKNOWN_ERROR')
    },
    runWdkWalletLock: async (name) => locks.push(name)
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(locks, ['rationtreasury'])
  assert.deepEqual(errors, ['The configured Sepolia RPC provider could not serve the balance request.'])
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
    runWdkGetUsdtBalance: async () => ({ balance: '10000000', formatted: '10 USDT' }),
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

test('run owns one ephemeral sandbox from funding through sweep and disposal', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  const sandbox = {
    address: '0xephemeral',
    getBalance: async () => {
      events.push(['sandbox-balance'])
      return 760000n
    },
    sweep: async (recipient) => {
      events.push(['sweep', recipient])
      return { amount: 710000n, fee: 50000n, hash: '0xsweep' }
    },
    dispose: () => events.push(['dispose'])
  }
  const exitCode = await main(['run', '--budget', '1', '--', 'claude', '--model', 'sonnet'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    createEphemeralSandbox: async (config) => {
      events.push(['create-ephemeral', config.safeModulesVersion])
      return sandbox
    },
    runWdkWalletUnlock: async (name) => events.push(['unlock', name]),
    runWdkGetAddress: async (name, network) => {
      events.push(['treasury-address', name, network])
      return { address: '0xtreasury' }
    },
    runWdkGetUsdtBalance: async () => ({ balance: '2000000', formatted: '2 USDT' }),
    runWdkTransfer: async (input) => {
      events.push([input.dryRun ? 'preview' : 'fund', input.to])
      return input.dryRun ? preview('0xephemeral') : { txHash: '0xfund' }
    },
    confirmTransfer: async () => true,
    runWdkWalletLock: async (name) => events.push(['lock', name]),
    waitForSandboxFunding: async (value, expected) => {
      assert.equal(value, sandbox)
      assert.equal(expected, 1000000n)
      events.push(['funding-confirmed'])
      return expected
    },
    runRequestedCommand: async (command, commandArgs) => {
      events.push(['command', command, commandArgs])
      return { code: 0, signal: null }
    }
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(events.map((event) => event[0]), [
    'create-ephemeral', 'unlock', 'treasury-address', 'preview', 'fund', 'lock',
    'funding-confirmed', 'command', 'sandbox-balance', 'sweep', 'dispose'
  ])
  assert.equal(logs.includes('Budget       1.00 USDT'), true)
  assert.equal(logs.includes('Network fee  0.05 USDT'), true)
  assert.equal(logs.includes('Total        1.05 USDT'), true)
  assert.equal(logs.includes('Returned   0.71 USDT'), true)
  assert.equal(logs.at(-1), 'Sandbox    disposed')
})

test('run fails before funding when the treasury cannot cover budget plus fee', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    createEphemeralSandbox: async () => ({
      address: '0xephemeral',
      dispose: () => events.push('dispose')
    }),
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkGetUsdtBalance: async () => ({ balance: '1020000', formatted: '1.02 USDT' }),
    runWdkTransfer: async (input) => {
      events.push(input.dryRun ? 'preview' : 'fund')
      return preview('0xephemeral')
    },
    confirmTransfer: async () => events.push('confirm'),
    runWdkWalletLock: async () => events.push('lock')
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(events, ['preview', 'lock', 'dispose'])
  assert.equal(logs.includes('Total        1.05 USDT'), true)
  assert.deepEqual(errors, [
    'Insufficient treasury funds: available 1.02 USDT, required 1.05 USDT.',
    "Add USD₮ to the treasury address shown by 'ration setup', then try again."
  ])
})

test('submitted funding is located and swept when treasury locking fails', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const sandbox = {
    address: '0xephemeral',
    getBalance: async () => {
      events.push('balance')
      return 1000000n
    },
    sweep: async () => {
      events.push('sweep')
      return { amount: 950000n, fee: 50000n, remaining: 0n }
    },
    dispose: () => events.push('dispose')
  }
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    createEphemeralSandbox: async () => sandbox,
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkGetUsdtBalance: async () => ({ balance: '2000000', formatted: '2 USDT' }),
    runWdkTransfer: async (input) => {
      if (!input.dryRun) events.push('fund')
      return input.dryRun ? preview('0xephemeral') : { txHash: '0xfund' }
    },
    confirmTransfer: async () => true,
    runWdkWalletLock: async () => {
      events.push('lock')
      throw new WalletLockError(1, null, 'daemon unavailable')
    },
    waitForSandboxFunding: async () => {
      events.push('funding-confirmed')
      return 1000000n
    },
    runRequestedCommand: async () => events.push('command')
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(events, [
    'fund', 'lock', 'lock', 'funding-confirmed', 'balance', 'sweep', 'dispose'
  ])
  assert.equal(errors.some((line) => line.includes('could not be locked')), true)
})

test('an ambiguous funding broadcast failure still reconciles and sweeps', async () => {
  const { output } = captureOutput()
  const events = []
  const sandbox = {
    address: '0xephemeral',
    getBalance: async () => 1000000n,
    sweep: async () => {
      events.push('sweep')
      return { amount: 950000n, fee: 50000n, remaining: 0n }
    },
    dispose: () => events.push('dispose')
  }
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    createEphemeralSandbox: async () => sandbox,
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkGetUsdtBalance: async () => ({ balance: '2000000', formatted: '2 USDT' }),
    runWdkTransfer: async (input) => {
      if (input.dryRun) return preview('0xephemeral')
      throw new WalletTransferError('broadcast', 1, null, 'ambiguous provider failure')
    },
    confirmTransfer: async () => true,
    runWdkWalletLock: async () => {},
    waitForSandboxFunding: async () => {
      events.push('funding-confirmed')
      return 1000000n
    }
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(events, ['funding-confirmed', 'sweep', 'dispose'])
})

test('an interrupt during funding confirmation prevents child launch but still sweeps', async () => {
  const { output } = captureOutput()
  const events = []
  let waits = 0
  const sandbox = {
    address: '0xephemeral',
    getBalance: async () => 1000000n,
    sweep: async () => {
      events.push('sweep')
      return { amount: 950000n, fee: 50000n, remaining: 0n }
    },
    dispose: () => events.push('dispose')
  }
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    createEphemeralSandbox: async () => sandbox,
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkGetUsdtBalance: async () => ({ balance: '2000000', formatted: '2 USDT' }),
    runWdkTransfer: async (input) => input.dryRun ? preview('0xephemeral') : { txHash: '0xfund' },
    confirmTransfer: async () => true,
    runWdkWalletLock: async () => {},
    waitForSandboxFunding: async () => {
      waits++
      if (waits === 1) {
        process.emit('SIGINT')
        const error = new Error('interrupted')
        error.signal = 'SIGINT'
        throw error
      }
      return 1000000n
    },
    runRequestedCommand: async () => events.push('command')
  })

  assert.equal(exitCode, 130)
  assert.equal(waits, 2)
  assert.deepEqual(events, ['sweep', 'dispose'])
})

test('run rejects persistent sandbox syntax and invalid budgets', async () => {
  for (const args of [
    ['run', 'rationa31f', '--ttl', '10', '--', 'claude'],
    ['run', '--budget', '0', '--', 'claude'],
    ['run', '--budget', '1.0000001', '--', 'claude'],
    ['run', '--budget', '1', 'claude'],
    ['run', '--budget', '1', '--']
  ]) {
    const { errors, output } = captureOutput()
    assert.equal(await main(args, { output }), 1)
    assert.deepEqual(errors, ['Usage: ration run --budget <amount> -- <command> [args...]'])
  }
})

test('run disposes the sandbox and fails closed when sweeping fails', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const sandbox = {
    address: '0xephemeral',
    getBalance: async () => 1000000n,
    sweep: async () => { throw new Error('provider detail') },
    dispose: () => events.push('dispose')
  }
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    createEphemeralSandbox: async () => sandbox,
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkGetUsdtBalance: async () => ({ balance: '2000000', formatted: '2 USDT' }),
    runWdkTransfer: async (input) => input.dryRun ? preview('0xephemeral') : { txHash: '0xfund' },
    confirmTransfer: async () => true,
    runWdkWalletLock: async () => {},
    waitForSandboxFunding: async () => 1000000n,
    runRequestedCommand: async () => ({ code: 0, signal: null })
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(events, ['dispose'])
  assert.equal(errors.includes('Security cleanup failed: the sandbox remainder could not be swept to the treasury.'), true)
  assert.doesNotMatch(errors.join('\n'), /provider detail/)
})

test('Ctrl+C stops the child, then sweeps and disposes the ephemeral sandbox', async () => {
  const { output } = captureOutput()
  const events = []
  const child = new EventEmitter()
  child.kill = (signal) => {
    events.push(['kill', signal])
    queueMicrotask(() => child.emit('close', null, signal))
    return true
  }
  const sandbox = {
    address: '0xephemeral',
    getBalance: async () => 1000000n,
    sweep: async () => {
      events.push(['sweep'])
      return { amount: 950000n, fee: 50000n }
    },
    dispose: () => events.push(['dispose'])
  }

  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    createEphemeralSandbox: async () => sandbox,
    runWdkWalletUnlock: async () => {},
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkGetUsdtBalance: async () => ({ balance: '2000000', formatted: '2 USDT' }),
    runWdkTransfer: async (input) => input.dryRun ? preview('0xephemeral') : { txHash: '0xfund' },
    confirmTransfer: async () => true,
    runWdkWalletLock: async () => {},
    waitForSandboxFunding: async () => 1000000n,
    runRequestedCommand: (command, commandArgs) => runRequestedCommand(command, commandArgs, {
      spawnProcess: () => {
        queueMicrotask(() => process.emit('SIGINT'))
        return child
      }
    })
  })

  assert.equal(exitCode, 130)
  assert.deepEqual(events, [['kill', 'SIGINT'], ['sweep'], ['dispose']])
})

test('normal create syntax does not accept source-wallet selection', async () => {
  const { errors, output } = captureOutput()
  const exitCode = await main(['create', '--from', 'personal', '--budget', '5'], { output })
  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['Usage: ration create --budget <amount>'])
})

test('an interrupt after advanced funding confirmation prevents broadcast', async () => {
  const { output } = captureOutput()
  let broadcasts = 0
  const exitCode = await main(['fund', 'rationa31f', '--amount', '1'], {
    output,
    runWdkWalletList: async () => [
      { name: 'rationtreasury', unlocked: false },
      { name: 'rationa31f', unlocked: false }
    ],
    runWdkWalletUnlock: async () => {},
    runWdkGetUsdtBalance: async () => ({ balance: '2000000', formatted: '2 USDT' }),
    runWdkGetAddress: async () => ({ address: '0xsandbox' }),
    runWdkTransfer: async (input) => {
      if (!input.dryRun) broadcasts++
      return preview('0xsandbox')
    },
    confirmTransfer: async () => {
      process.emit('SIGINT')
      return true
    },
    runWdkWalletLock: async () => {}
  })

  assert.equal(exitCode, 130)
  assert.equal(broadcasts, 0)
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
  assert.match(logs[0], /run --budget/)
  assert.doesNotMatch(logs[0], /^\s+(create|list|unlock|address|fund)\b/m)
})
