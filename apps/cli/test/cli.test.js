import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import {
  WalletLockError,
  WalletTransferError,
  WalletUnlockError,
  confirmTransfer,
  createWdkOutputFilter,
  main as cliMain,
  runRequestedCommand,
  runWdkGetAddress,
  runWdkGetEthBalance,
  runWdkGetNetworkConfig,
  runWdkGetUsdtBalance,
  runWdkTransfer,
  runWdkWalletCreate,
  runWdkWalletList,
  runWdkWalletLock,
  runWdkWalletUnlock
} from '../src/cli.js'

const STANDARD_CONFIG = {
  chainId: 11155111,
  provider: 'https://ethereum-sepolia-rpc.publicnode.com',
  transferMaxFee: 5000000000000000
}
const GAS_RESERVE = 151250n

function main (args, options = {}) {
  return cliMain(args, {
    runWdkGetNetworkConfig: async () => STANDARD_CONFIG,
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

function preview (input) {
  return {
    network: 'sepolia',
    to: input.to,
    amount: String(input.expectedBaseUnits),
    amountFormatted: input.token ? '1 USDT' : '0.0000000000001 ETH',
    tokenSymbol: input.token ? 'USDT' : 'ETH',
    estimatedFee: input.token ? '50000' : '21000',
    estimatedFeeFormatted: input.token ? '0.00000000000005 ETH' : '0.000000000000021 ETH'
  }
}

function createSandbox (events, overrides = {}) {
  return {
    address: '0xephemeral',
    quoteLifecycleGas: async (recipient) => {
      events.push(['quote-lifecycle', recipient])
      return { tokenFee: 50000n, nativeFee: 21000n }
    },
    getUsdtBalance: async () => {
      events.push(['sandbox-usdt'])
      return 450000n
    },
    sweepUsdt: async (recipient) => {
      events.push(['sweep-usdt', recipient])
      return { amount: 450000n, fee: 50000n, hash: '0xreturnusdt', remaining: 0n }
    },
    sweepEth: async (recipient) => {
      events.push(['sweep-eth', recipient])
      return {
        amount: 25000n,
        fee: 21000n,
        hash: '0xreturneth',
        transactions: [{ amount: 25000n, fee: 21000n, hash: '0xreturneth' }],
        remaining: 5000n
      }
    },
    openMcp: async () => {
      events.push(['open-mcp'])
      return {
        configureLaunch: (command, args) => ({ command, args, env: process.env }),
        close: async () => events.push(['close-mcp'])
      }
    },
    dispose: () => events.push(['dispose']),
    ...overrides
  }
}

function successfulRunOptions (events, overrides = {}) {
  const sandbox = overrides.sandbox ?? createSandbox(events)
  return {
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    createEphemeralSandbox: async (config) => {
      events.push(['create-ephemeral', config.chainId])
      return sandbox
    },
    runWdkWalletUnlock: async (name) => events.push(['unlock', name]),
    runWdkGetAddress: async (name, network) => {
      events.push(['treasury-address', name, network])
      return { address: '0xtreasury', network }
    },
    runWdkGetUsdtBalance: async () => ({ balance: '2000000', formatted: '2 USDT' }),
    runWdkGetEthBalance: async () => ({
      balance: '1000000000000000000',
      formatted: '1 ETH'
    }),
    runWdkTransfer: async (input) => {
      events.push([input.dryRun ? `preview-${input.token ? 'usdt' : 'eth'}` : `fund-${input.token ? 'usdt' : 'eth'}`, input.to])
      return input.dryRun
        ? preview(input)
        : {
            network: 'sepolia',
            to: input.to,
            amount: String(input.expectedBaseUnits),
            txHash: input.token ? '0xfundusdt' : '0xfundeth'
          }
    },
    confirmTransfer: async () => true,
    runWdkWalletLock: async (name) => events.push(['lock', name]),
    waitForSandboxGas: async (value, expected) => {
      assert.equal(value, sandbox)
      events.push(['gas-confirmed', expected])
      return expected
    },
    waitForSandboxFunding: async (value, expected) => {
      assert.equal(value, sandbox)
      events.push(['funding-confirmed', expected])
      return expected
    },
    runRequestedCommand: async (command, args) => {
      events.push(['command', command, args])
      return { code: 0, signal: null }
    },
    persistSessionReceipt: async () => '/tmp/ration/session.json',
    ...overrides,
    sandbox: undefined
  }
}

test('delegates secret-bearing wallet creation and unlock to the official CLI terminal', async () => {
  for (const [operation, invoke, expected] of [
    ['create', (options) => runWdkWalletCreate('rationtreasury', options), ['wallet', 'create', '--name', 'rationtreasury']],
    ['unlock', (options) => runWdkWalletUnlock('rationtreasury', options), ['wallet', 'unlock', '--name', 'rationtreasury', '--ttl', '5']]
  ]) {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stdout.setEncoding = () => {}
    let invocation
    const result = invoke({
      wdkCliPath: '/wdk.mjs',
      spawnProcess: (...args) => {
        invocation = args
        return child
      }
    })
    child.emit('close', 0, null)
    await result
    assert.equal(operation.length > 0, true)
    assert.deepEqual(invocation, [process.execPath, ['/wdk.mjs', ...expected], { stdio: ['inherit', 'pipe', 'inherit'] }])
  }
})

test('filters WDK session noise while streaming masked passphrase prompts', () => {
  const written = []
  const filter = createWdkOutputFilter((line) => written.push(line))
  filter("Wallet 'rationtreasury' unlocked\n")
  filter('Session locks after 5 minutes\n')
  filter('? Enter passphrase: [input is masked]')
  assert.deepEqual(written, ["Wallet 'rationtreasury' unlocked\n", '? Enter passphrase: [input is masked]'])
})

test('empty-passphrase setup creates, unlocks, and locks without exposing secrets', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  let lists = 0
  const exitCode = await main(['setup', '--insecure'], {
    output,
    runWdkWalletList: async () => ++lists === 1 ? [] : [{ name: 'rationtreasury', unlocked: false }],
    runWdkWalletCreate: async (name, options) => events.push(['create', name, options]),
    runWdkWalletUnlock: async (name, options) => events.push(['unlock', name, options]),
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
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

test('uses structured official CLI output for wallet listing and locking', async () => {
  const invocations = []
  const options = {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocations.push(args)
      return args[1][2] === 'list'
        ? jsonChild({ wallets: [{ name: 'rationtreasury', unlocked: false }], count: 1 })
        : jsonChild({ wallet: 'rationtreasury', locked: true })
    }
  }
  assert.equal((await runWdkWalletList(options))[0].name, 'rationtreasury')
  assert.equal((await runWdkWalletLock('rationtreasury', options)).locked, true)
  assert.deepEqual(invocations.map((call) => call[1]), [
    ['/wdk.mjs', 'wallet', 'list', '--json'],
    ['/wdk.mjs', 'wallet', 'lock', '--name', 'rationtreasury', '--json']
  ])
})

test('launches the requested command directly without leaking WDK credentials', async () => {
  const child = new EventEmitter()
  let invocation
  const previous = process.env.WDK_PASSPHRASE
  const previousSeed = process.env.WDK_SEED
  const previousSeedCommand = process.env.WDK_SEED_COMMAND
  const previousSeedFile = process.env.WDK_SEED_FILE
  process.env.WDK_PASSPHRASE = 'must-not-leak'
  process.env.WDK_SEED = 'must-not-leak'
  process.env.WDK_SEED_COMMAND = 'must-not-leak'
  process.env.WDK_SEED_FILE = 'must-not-leak'
  try {
    const result = runRequestedCommand('node', ['-e', 'console.log(1)'], {
      spawnProcess: (...args) => {
        invocation = args
        return child
      }
    })
    child.emit('close', 0, null)
    assert.deepEqual(await result, { code: 0, signal: null })
    assert.equal(invocation[2].stdio, 'inherit')
    assert.equal('WDK_PASSPHRASE' in invocation[2].env, false)
    assert.equal('WDK_SEED' in invocation[2].env, false)
    assert.equal('WDK_SEED_COMMAND' in invocation[2].env, false)
    assert.equal('WDK_SEED_FILE' in invocation[2].env, false)
  } finally {
    if (previous === undefined) delete process.env.WDK_PASSPHRASE
    else process.env.WDK_PASSPHRASE = previous
    if (previousSeed === undefined) delete process.env.WDK_SEED
    else process.env.WDK_SEED = previousSeed
    if (previousSeedCommand === undefined) delete process.env.WDK_SEED_COMMAND
    else process.env.WDK_SEED_COMMAND = previousSeedCommand
    if (previousSeedFile === undefined) delete process.env.WDK_SEED_FILE
    else process.env.WDK_SEED_FILE = previousSeedFile
  }
})

test('uses the official standard Sepolia network for address and both balances', async () => {
  const invocations = []
  const options = {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocations.push(args[1])
      if (args[1][2] === 'address') return jsonChild({ network: 'sepolia', address: '0xabc' })
      if (args[1].includes('--token')) {
        return jsonChild({ network: 'sepolia', symbol: 'USDT', balance: '42000000', formatted: '42 USDT' })
      }
      return jsonChild({ network: 'sepolia', symbol: 'ETH', balance: '1000000000000000', formatted: '0.001 ETH' })
    }
  }
  await runWdkGetAddress('rationtreasury', undefined, options)
  await runWdkGetUsdtBalance('rationtreasury', undefined, options)
  await runWdkGetEthBalance('rationtreasury', undefined, options)
  assert.deepEqual(invocations, [
    ['/wdk.mjs', 'get', 'address', '--wallet', 'rationtreasury', '--network', 'sepolia', '--json'],
    ['/wdk.mjs', 'get', 'balance', '--wallet', 'rationtreasury', '--network', 'sepolia', '--token', 'USDT', '--json'],
    ['/wdk.mjs', 'get', 'balance', '--wallet', 'rationtreasury', '--network', 'sepolia', '--json']
  ])
})

test('reads the standard Sepolia config through structured output', async () => {
  const invocations = []
  assert.deepEqual(await runWdkGetNetworkConfig(undefined, {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocations.push(args[1])
      return jsonChild({ network: 'sepolia', config: STANDARD_CONFIG })
    }
  }), STANDARD_CONFIG)
  assert.deepEqual(invocations[0], ['/wdk.mjs', 'config', 'get', '--network', 'sepolia', '--json'])
})

test('uses token sends for budget and base-unit native sends for gas', async () => {
  const invocations = []
  const options = {
    wdkCliPath: '/wdk.mjs',
    spawnProcess: (...args) => {
      invocations.push(args[1])
      const input = {
        to: '0xsandbox',
        expectedBaseUnits: args[1].includes('--token') ? 1000000n : GAS_RESERVE
      }
      return jsonChild(preview({ ...input, token: args[1].includes('--token') ? 'USDT' : undefined }))
    }
  }
  await runWdkTransfer({ network: 'sepolia', to: '0xsandbox', amount: '1', token: 'USDT', expectedBaseUnits: 1000000n, dryRun: true }, options)
  await runWdkTransfer({ network: 'sepolia', to: '0xsandbox', amount: GAS_RESERVE, baseUnits: true, expectedBaseUnits: GAS_RESERVE, dryRun: true }, options)
  assert.equal(invocations[0].includes('--token'), true)
  assert.equal(invocations[1].includes('--token'), false)
  assert.equal(invocations[1].includes('--base-units'), true)
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

test('setup clearly identifies one standard EOA address for USDT and ETH funding', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  const exitCode = await main(['setup'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    runWdkWalletUnlock: async () => events.push('unlock'),
    runWdkGetAddress: async (name, network) => {
      events.push(network)
      return { address: '0xtreasury' }
    },
    runWdkWalletLock: async () => events.push('lock')
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(events, ['unlock', 'sepolia', 'lock'])
  assert.equal(logs.includes('  Address   0xtreasury'), true)
  assert.equal(logs.includes('  Account   standard Sepolia EOA'), true)
  assert.match(logs.at(-1), /same address.*test USD₮.*Sepolia ETH/)
})

test('status reports USDT budget funds and ETH infrastructure separately', async () => {
  const { logs, errors, output } = captureOutput()
  const exitCode = await main(['status'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkGetAddress: async () => ({ address: '0xtreasury' }),
    runWdkGetUsdtBalance: async () => ({ balance: '5000000', formatted: '5 USDT' }),
    runWdkGetEthBalance: async () => ({ balance: '1000000000000000', formatted: '0.001 ETH' }),
    runWdkWalletLock: async () => {}
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(logs, [
    'Ration treasury', '', 'Address   0xtreasury', 'USDT      5.00 USDT',
    'Gas       0.001 ETH', 'Status    locked'
  ])
})

test('run fails closed before unlocking if standard Sepolia is replaced by account abstraction', async () => {
  const { errors, output } = captureOutput()
  let unlocked = false
  const exitCode = await cliMain(['run', '--budget', '1', '--', 'agent'], {
    output,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: false }],
    runWdkGetNetworkConfig: async () => ({ ...STANDARD_CONFIG, bundlerUrl: 'https://secret.example/key' }),
    runWdkWalletUnlock: async () => { unlocked = true }
  })
  assert.equal(exitCode, 1)
  assert.equal(unlocked, false)
  assert.match(errors[0], /standard Sepolia EVM network/)
  assert.doesNotMatch(errors.join('\n'), /secret/)
})

test('run reports a confirmed 0.05 USDT payment and sweeps the remaining 0.45 before ETH', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  const exitCode = await main(['run', '--budget', '0.5', '--', 'node', '-e', 'console.log(1)'], {
    output,
    ...successfulRunOptions(events)
  })
  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(events.map((event) => event[0]), [
    'create-ephemeral', 'unlock', 'treasury-address', 'quote-lifecycle',
    'preview-usdt', 'preview-eth', 'fund-eth', 'gas-confirmed', 'fund-usdt',
    'lock', 'funding-confirmed', 'open-mcp', 'command', 'close-mcp', 'sandbox-usdt', 'sweep-usdt',
    'sweep-eth', 'dispose'
  ])
  assert.equal(logs.includes('Budget        0.50 USDT'), true)
  assert.equal(logs.some((line) => line.includes('Gas reserve') && line.includes('infrastructure')), true)
  assert.deepEqual(events.find((event) => event[0] === 'gas-confirmed'), [
    'gas-confirmed', 401250n
  ])
  assert.equal(logs.some((line) => /Network fee.*USDT|Total.*USDT/.test(line)), false)
  assert.equal(logs.includes('Spent       0.05 USDT'), true)
  assert.equal(logs.includes('Returned    0.45 USDT'), true)
  assert.equal(logs.includes('Sandbox     disposed'), true)
})

test('run reports the demo acceptance totals and preserves cleanup order', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  const sandbox = createSandbox(events, {
    getUsdtBalance: async () => {
      events.push(['sandbox-usdt'])
      return 80000n
    },
    sweepUsdt: async (recipient) => {
      events.push(['sweep-usdt', recipient])
      return { amount: 80000n, fee: 50000n, remaining: 0n }
    }
  })
  const exitCode = await main(['run', '--budget', '0.10', '--', 'codex'], {
    output,
    ...successfulRunOptions(events, { sandbox })
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.equal(logs.includes('Spent       0.02 USDT'), true)
  assert.equal(logs.includes('Returned    0.08 USDT'), true)
  assert.equal(logs.includes('Funding sandbox'), true)
  assert.equal(logs.includes('  Waiting for gas confirmation on Sepolia...'), true)
  assert.equal(logs.includes('  Waiting for budget confirmation on Sepolia...'), true)
  assert.equal(logs.includes('Closing session'), true)
  assert.equal(logs.includes('  Returning 0.08 USDT and waiting for confirmation...'), true)
  assert.equal(logs.includes('  Returning unused Sepolia ETH and waiting for confirmation...'), true)
  assert.equal(logs.includes('Sandbox     disposed'), true)
  assert.deepEqual(events.slice(-5).map((event) => event[0]), [
    'close-mcp', 'sandbox-usdt', 'sweep-usdt', 'sweep-eth', 'dispose'
  ])
})

test('run fails before confirmation when treasury USDT is below the exact budget', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const options = successfulRunOptions(events)
  options.runWdkGetUsdtBalance = async () => ({ balance: '500000', formatted: '0.5 USDT' })
  options.confirmTransfer = async () => events.push(['confirm'])
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], { output, ...options })
  assert.equal(exitCode, 1)
  assert.equal(events.some((event) => event[0] === 'fund-eth'), false)
  assert.equal(events.some((event) => event[0] === 'confirm'), false)
  assert.match(errors[0], /Insufficient treasury USD₮/)
  assert.equal(events.at(-1)[0], 'dispose')
})

test('run fails before confirmation when treasury ETH cannot provision lifecycle gas', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const options = successfulRunOptions(events)
  options.runWdkGetEthBalance = async () => ({ balance: '1000', formatted: '0.000000000000001 ETH' })
  options.confirmTransfer = async () => events.push(['confirm'])
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], { output, ...options })
  assert.equal(exitCode, 1)
  assert.equal(events.some((event) => event[0] === 'fund-eth'), false)
  assert.equal(events.some((event) => event[0] === 'confirm'), false)
  assert.match(errors[0], /Insufficient treasury gas/)
})

test('declining funding broadcasts nothing and disposes the EOA', async () => {
  const { logs, output } = captureOutput()
  const events = []
  const options = successfulRunOptions(events)
  options.confirmTransfer = async () => false
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], { output, ...options })
  assert.equal(exitCode, 0)
  assert.equal(events.some((event) => event[0].startsWith('fund-')), false)
  assert.equal(events.at(-1)[0], 'dispose')
  assert.equal(logs.at(-1), 'Session cancelled. Nothing was broadcast.')
})

test('a malformed native fee quote fails before confirmation or broadcast', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const options = successfulRunOptions(events)
  options.runWdkTransfer = async (input) => ({ ...preview(input), estimatedFee: input.token ? '50000' : '0' })
  options.confirmTransfer = async () => events.push(['confirm'])
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], { output, ...options })
  assert.equal(exitCode, 1)
  assert.match(errors[0], /valid Sepolia ETH gas quote/)
  assert.equal(events.some((event) => event[0] === 'confirm'), false)
  assert.equal(events.at(-1)[0], 'dispose')
})

test('an ambiguous USDT broadcast failure is redacted and still returns provisioned ETH', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const providerDetail = 'never-print-this-provider-detail'
  const sandbox = createSandbox(events, { getUsdtBalance: async () => 0n })
  const options = successfulRunOptions(events, { sandbox })
  options.runWdkTransfer = async (input) => {
    if (input.dryRun) return preview(input)
    if (!input.token) return { txHash: '0xgas' }
    throw new WalletTransferError('broadcast', 1, null, providerDetail, 'UNKNOWN_ERROR')
  }
  options.waitForSandboxFunding = async () => { throw new Error('not found') }
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], { output, ...options })
  assert.equal(exitCode, 1)
  assert.doesNotMatch(errors.join('\n'), new RegExp(providerDetail))
  assert.match(errors[0], /treasury USDT transfer failed/)
  assert.deepEqual(events.slice(-2).map((event) => event[0]), ['sweep-eth', 'dispose'])
})

test('a treasury lock failure still sweeps USDT first, then ETH, then disposes', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const options = successfulRunOptions(events)
  options.runWdkWalletLock = async () => {
    events.push(['lock'])
    throw new WalletLockError(1, null, 'daemon unavailable')
  }
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], { output, ...options })
  assert.equal(exitCode, 1)
  assert.equal(errors.some((line) => line.includes('could not be locked')), true)
  assert.deepEqual(events.slice(-4).map((event) => event[0]), ['sandbox-usdt', 'sweep-usdt', 'sweep-eth', 'dispose'])
})

test('an interrupt during USDT confirmation prevents child launch but preserves cleanup order', async () => {
  const { output } = captureOutput()
  const events = []
  let waits = 0
  const options = successfulRunOptions(events)
  options.waitForSandboxFunding = async () => {
    waits++
    if (waits === 1) {
      process.emit('SIGINT')
      const error = new Error('interrupted')
      error.signal = 'SIGINT'
      throw error
    }
    return 1000000n
  }
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], { output, ...options })
  assert.equal(exitCode, 130)
  assert.equal(waits, 2)
  assert.equal(events.some((event) => event[0] === 'command'), false)
  assert.deepEqual(events.slice(-4).map((event) => event[0]), ['sandbox-usdt', 'sweep-usdt', 'sweep-eth', 'dispose'])
})

test('USDT sweep failure still attempts ETH recovery and disposal', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const sandbox = createSandbox(events, {
    sweepUsdt: async () => {
      events.push(['sweep-usdt'])
      throw new Error('provider detail')
    }
  })
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    ...successfulRunOptions(events, { sandbox })
  })
  assert.equal(exitCode, 1)
  assert.match(errors.join('\n'), /USD₮ remainder/)
  assert.doesNotMatch(errors.join('\n'), /provider detail/)
  assert.deepEqual(events.slice(-5).map((event) => event[0]), ['close-mcp', 'sandbox-usdt', 'sweep-usdt', 'sweep-eth', 'dispose'])
})

test('a disposal failure is reported without claiming the sandbox was disposed', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  const sandbox = createSandbox(events, {
    dispose: () => { throw new Error('dispose failed') }
  })
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    ...successfulRunOptions(events, { sandbox })
  })
  assert.equal(exitCode, 1)
  assert.match(errors.join('\n'), /could not be disposed/)
  assert.equal(logs.includes('Sandbox     failed'), true)
})

test('Ctrl+C stops the child, then sweeps USDT, returns ETH, and disposes', async () => {
  const { output } = captureOutput()
  const events = []
  const child = new EventEmitter()
  child.kill = (signal) => {
    events.push(['kill', signal])
    queueMicrotask(() => child.emit('close', null, signal))
    return true
  }
  const options = successfulRunOptions(events)
  options.runRequestedCommand = (command, args) => runRequestedCommand(command, args, {
    spawnProcess: () => {
      queueMicrotask(() => process.emit('SIGINT'))
      return child
    }
  })
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], { output, ...options })
  assert.equal(exitCode, 130)
  assert.deepEqual(events.slice(-6).map((event) => event[0]), ['kill', 'close-mcp', 'sandbox-usdt', 'sweep-usdt', 'sweep-eth', 'dispose'])
})

test('an MCP close failure is reported but does not prevent wallet recovery', async () => {
  const { errors, output } = captureOutput()
  const events = []
  const sandbox = createSandbox(events, {
    openMcp: async () => ({
      configureLaunch: (command, args) => ({ command, args, env: process.env }),
      close: async () => {
        events.push(['close-mcp'])
        throw new Error('close detail')
      }
    })
  })
  const exitCode = await main(['run', '--budget', '1', '--', 'agent'], {
    output,
    ...successfulRunOptions(events, { sandbox })
  })
  assert.equal(exitCode, 1)
  assert.match(errors.join('\n'), /MCP server could not be closed/)
  assert.doesNotMatch(errors.join('\n'), /close detail/)
  assert.deepEqual(events.slice(-5).map((event) => event[0]), [
    'close-mcp', 'sandbox-usdt', 'sweep-usdt', 'sweep-eth', 'dispose'
  ])
})

test('cleanup treats an already locked treasury as secure', async () => {
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

test('an interrupt waits for treasury cleanup and returns the signal exit code', async () => {
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

test('run rejects invalid syntax and non-USDT budgets', async () => {
  for (const args of [
    ['run', '--budget', '0', '--', 'node'],
    ['run', '--budget', '1.0000001', '--', 'node'],
    ['run', '--budget', '1', 'node'],
    ['run', '--budget', '1', '--']
  ]) {
    const { errors, output } = captureOutput()
    assert.equal(await main(args, { output }), 1)
    assert.deepEqual(errors, ['Usage: ration run --budget <amount> -- <command> [args...]'])
  }
})

test('run persists a complete receipt for purchases, direct transfers, returns, and disposal', async () => {
  const { logs, errors, output } = captureOutput()
  const events = []
  let persisted
  let receivedSession
  const sandbox = createSandbox(events, {
    getUsdtBalance: async () => {
      events.push(['sandbox-usdt'])
      return 30000n
    },
    sweepUsdt: async (recipient) => {
      events.push(['sweep-usdt', recipient])
      return { amount: 30000n, fee: 50000n, hash: '0xreturnusdt', remaining: 0n }
    },
    openMcp: async (mcpOptions) => {
      events.push(['open-mcp'])
      receivedSession = mcpOptions.session
      receivedSession.recordActivity({
        type: 'resource_purchase',
        resource: 'external-analyst-notes',
        amountBaseUnits: '20000',
        recipientAddress: '0xseller',
        transactionHash: `0x${'a'.repeat(64)}`,
        feeWei: '41000',
        status: 'confirmed'
      })
      receivedSession.recordActivity({
        type: 'direct_usdt_transfer',
        resource: null,
        recipientAddress: '0xattacker',
        amountBaseUnits: '50000',
        transactionHash: `0x${'b'.repeat(64)}`,
        feeWei: '41000',
        status: 'confirmed'
      })
      return {
        configureLaunch: (command, args) => ({ command, args, env: process.env }),
        close: async () => events.push(['close-mcp'])
      }
    }
  })
  const exitCode = await main(['run', '--budget', '0.10', '--', 'codex'], {
    output,
    ...successfulRunOptions(events, { sandbox }),
    persistSessionReceipt: async (receipt) => { persisted = structuredClone(receipt) }
  })

  assert.equal(exitCode, 0)
  assert.deepEqual(errors, [])
  assert.equal(typeof receivedSession.recordActivity, 'function')
  const report = logs.join('\n')
  assert.match(report, /Budget      0\.10 USDT/)
  assert.match(report, /Spent       0\.07 USDT/)
  assert.match(report, /Returned    0\.03 USDT/)
  assert.match(report, /external-analyst-notes/)
  assert.match(report, /0xattacker/)
  assert.equal(persisted.sandboxAddress, '0xephemeral')
  assert.equal(persisted.treasuryAddress, '0xtreasury')
  assert.equal(persisted.initialUsdtBudgetBaseUnits, '100000')
  assert.equal(persisted.initialGasReserveWei, '401250')
  assert.equal(persisted.totalUsdtSpentBaseUnits, '70000')
  assert.equal(persisted.resourcePurchaseTotalBaseUnits, '20000')
  assert.equal(persisted.directUsdtTransferTotalBaseUnits, '50000')
  assert.equal(persisted.usdtReturnedToTreasuryBaseUnits, '30000')
  assert.equal(persisted.fundingTransactions.eth.transactionHash, '0xfundeth')
  assert.equal(persisted.fundingTransactions.usdt.transactionHash, '0xfundusdt')
  assert.equal(persisted.returnTransactions.usdt.transactionHash, '0xreturnusdt')
  assert.equal(persisted.returnTransactions.eth[0].transactionHash, '0xreturneth')
  assert.equal(persisted.activity.length, 2)
  assert.equal(persisted.activity[0].transactionHash, `0x${'a'.repeat(64)}`)
  assert.equal(persisted.treasuryIsolation.lockedBeforeChild, true)
  assert.equal(persisted.treasuryIsolation.finalStatus, 'locked')
  assert.equal(persisted.sandboxDisposalStatus, 'disposed')
  assert.equal(persisted.childCommand.executable, 'codex')
  assert.equal(typeof persisted.startedAt, 'string')
  assert.equal(typeof persisted.endedAt, 'string')
})

test('history lists recent sessions and prints one detailed JSON receipt', async () => {
  const { logs, errors, output } = captureOutput()
  const receipt = {
    schemaVersion: 1,
    sessionId: '11111111-1111-4111-8111-111111111111',
    startedAt: '2026-08-23T12:00:00.000Z',
    totalUsdtSpentBaseUnits: '70000',
    sandboxDisposalStatus: 'disposed',
    childCommand: { executable: 'codex' }
  }
  assert.equal(await main(['history'], {
    output,
    listSessionReceipts: async () => [receipt]
  }), 0)
  assert.match(logs.join('\n'), /Recent sessions/)
  assert.match(logs.join('\n'), /0\.07 USDT spent.*disposed.*codex/)

  logs.length = 0
  assert.equal(await main(['history', receipt.sessionId], {
    output,
    readSessionReceipt: async (id) => {
      assert.equal(id, receipt.sessionId)
      return receipt
    }
  }), 0)
  assert.deepEqual(JSON.parse(logs[0]), receipt)
  assert.deepEqual(errors, [])
})

test('help keeps the complete product command surface', async () => {
  const { logs, output } = captureOutput()
  assert.equal(await main(['help'], { output }), 0)
  assert.match(logs[0], /setup/)
  assert.match(logs[0], /status/)
  assert.match(logs[0], /run --budget/)
  assert.match(logs[0], /history/)
})
