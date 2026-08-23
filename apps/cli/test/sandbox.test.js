import assert from 'node:assert/strict'
import test from 'node:test'

import { USDT_ADDRESS } from '../src/config.js'
import {
  createEphemeralSandbox,
  hierarchicalGasReserve,
  lifecycleGasReserve,
  waitForSandboxFunding,
  waitForSandboxGas
} from '../src/sandbox.js'

const config = {
  chainId: 11155111,
  provider: 'https://example.test',
  transferMaxFee: 5000000000000000n,
  transactionMaxFee: 5000000000000000n
}

test('ephemeral EOA keeps mutable seed bytes in memory and zeroes them on disposal', async () => {
  const events = []
  const seed = new Uint8Array(64).fill(7)
  const account = {
    getAddress: async () => '0xephemeral',
    dispose: () => events.push('account-dispose')
  }
  class FakeWalletManager {
    constructor (receivedSeed, receivedConfig) {
      assert.equal(receivedSeed, seed)
      assert.equal(receivedConfig, config)
    }

    async getAccount (index) {
      assert.equal(index, 0)
      return account
    }

    dispose () { events.push('wallet-dispose') }
  }

  const sandbox = await createEphemeralSandbox(config, {
    WalletManager: FakeWalletManager,
    randomBytes: () => seed
  })
  assert.equal(sandbox.address, '0xephemeral')
  assert.equal(seed.every((byte) => byte === 7), true)

  sandbox.dispose()
  sandbox.dispose()
  assert.deepEqual(events, ['account-dispose', 'wallet-dispose'])
  assert.equal(seed.every((byte) => byte === 0), true)
})

test('quotes a buffered ETH reserve for one payment, USDT sweep, and native cleanup', async () => {
  const quotes = []
  const account = {
    getAddress: async () => '0xephemeral',
    quoteTransfer: async (input) => {
      quotes.push(input)
      return { fee: 50000n }
    },
    quoteSendTransaction: async (input) => {
      quotes.push(input)
      return { fee: 21000n }
    },
    dispose: () => {}
  }
  class FakeWalletManager {
    async getAccount () { return account }
    dispose () {}
  }
  const sandbox = await createEphemeralSandbox(config, {
    WalletManager: FakeWalletManager,
    randomBytes: () => new Uint8Array(64)
  })

  const quote = await sandbox.quoteLifecycleGas('0xtreasury')
  assert.deepEqual(quotes, [
    { token: USDT_ADDRESS, recipient: '0xtreasury', amount: 0n },
    { to: '0xtreasury', value: 0n }
  ])
  assert.deepEqual(quote, { tokenFee: 50000n, nativeFee: 21000n })
  sandbox.dispose()
})

test('sizes lifecycle gas from a higher positive-transfer fee floor', () => {
  assert.equal(lifecycleGasReserve(80000n, 21000n), 226250n)
  assert.equal(lifecycleGasReserve(80000n, 21000n, 4), 526250n)
  assert.equal(hierarchicalGasReserve(50000n, 21000n, 6), 1933750n)
})

test('sweeps the full USDT balance before returning economical ETH', async () => {
  const events = []
  let tokenBalance = 1000000n
  let ethBalance = 150000n
  const account = {
    getAddress: async () => '0xephemeral',
    getTokenBalance: async () => tokenBalance,
    getBalance: async () => ethBalance,
    quoteTransfer: async (input) => {
      events.push(['quote-usdt', input.amount])
      return { fee: 50000n }
    },
    transfer: async (input) => {
      events.push(['send-usdt', input.amount])
      tokenBalance = 0n
      ethBalance -= 40000n
      return { hash: '0xusdt', fee: 50000n }
    },
    quoteSendTransaction: async (input) => {
      events.push(['quote-eth', input.value])
      return { fee: 21000n }
    },
    sendTransaction: async (input) => {
      events.push(['send-eth', input.value])
      ethBalance = 10000n
      return { hash: '0xeth', fee: 21000n }
    },
    waitForTransaction: async (hash, options) => {
      events.push(['confirm', hash, options])
      return { finality: 'confirmed', success: true }
    },
    dispose: () => {}
  }
  class FakeWalletManager {
    async getAccount () { return account }
    dispose () {}
  }
  const sandbox = await createEphemeralSandbox(config, {
    WalletManager: FakeWalletManager,
    randomBytes: () => new Uint8Array(64)
  })

  const usdt = await sandbox.sweepUsdt('0xtreasury')
  const eth = await sandbox.sweepEth('0xtreasury')
  assert.equal(usdt.amount, 1000000n)
  assert.equal(eth.amount, 89000n)
  assert.deepEqual(events.map((event) => event[0]), [
    'quote-usdt', 'send-usdt', 'confirm',
    'quote-eth', 'quote-eth', 'send-eth', 'confirm', 'quote-eth'
  ])
  assert.deepEqual(events.filter((event) => event[0] === 'confirm'), [
    ['confirm', '0xusdt', { target: 'confirmed', timeout: 180000, interval: 1000 }],
    ['confirm', '0xeth', { target: 'confirmed', timeout: 180000, interval: 1000 }]
  ])
  sandbox.dispose()
})

test('fails rather than abandoning ETH that remains economical after retry limit', async () => {
  const account = {
    getAddress: async () => '0xephemeral',
    getBalance: async () => 100000n,
    quoteSendTransaction: async () => ({ fee: 21000n }),
    sendTransaction: async () => ({ hash: '0xeth', fee: 21000n }),
    waitForTransaction: async () => ({ finality: 'confirmed', success: true }),
    dispose: () => {}
  }
  class FakeWalletManager {
    async getAccount () { return account }
    dispose () {}
  }
  const sandbox = await createEphemeralSandbox(config, {
    WalletManager: FakeWalletManager,
    randomBytes: () => new Uint8Array(64)
  })

  await assert.rejects(sandbox.sweepEth('0xtreasury'), /economical remainder/)
  sandbox.dispose()
})

test('retains a confirmed USDT return when the final balance read fails', async () => {
  let reads = 0
  const account = {
    getAddress: async () => '0xephemeral',
    getTokenBalance: async () => {
      if (++reads === 1) return 100000n
      throw new Error('rpc unavailable')
    },
    getBalance: async () => 100000n,
    quoteTransfer: async () => ({ fee: 50000n }),
    transfer: async () => ({ hash: '0xusdt', fee: 49000n }),
    waitForTransaction: async () => ({ finality: 'confirmed', success: true }),
    dispose: () => {}
  }
  class FakeWalletManager {
    async getAccount () { return account }
    dispose () {}
  }
  const sandbox = await createEphemeralSandbox(config, {
    WalletManager: FakeWalletManager,
    randomBytes: () => new Uint8Array(64)
  })

  assert.deepEqual(await sandbox.sweepUsdt('0xtreasury'), {
    amount: 100000n,
    fee: 49000n,
    hash: '0xusdt',
    transactions: [{
      hash: '0xusdt', amount: 100000n, fee: 49000n, status: 'confirmed'
    }],
    remaining: null
  })
  sandbox.dispose()
})

test('retains USDT return intent when submission outcome is unknown', async () => {
  const account = {
    getAddress: async () => '0xephemeral',
    getTokenBalance: async () => 100000n,
    getBalance: async () => 100000n,
    quoteTransfer: async () => ({ fee: 50000n }),
    transfer: async () => { throw new Error('provider response lost') },
    dispose: () => {}
  }
  class FakeWalletManager {
    async getAccount () { return account }
    dispose () {}
  }
  const sandbox = await createEphemeralSandbox(config, {
    WalletManager: FakeWalletManager,
    randomBytes: () => new Uint8Array(64)
  })

  await assert.rejects(sandbox.sweepUsdt('0xtreasury'), (error) => {
    assert.deepEqual(error.partialSweep.transactions, [{
      hash: null,
      amount: 100000n,
      fee: 50000n,
      status: 'submission_unknown'
    }])
    return true
  })
  sandbox.dispose()
})

test('attaches confirmed ETH returns when a later sweep round fails', async () => {
  let balanceReads = 0
  const account = {
    getAddress: async () => '0xephemeral',
    getBalance: async () => {
      if (++balanceReads === 1) return 100000n
      throw new Error('rpc unavailable')
    },
    quoteSendTransaction: async () => ({ fee: 21000n }),
    sendTransaction: async () => ({ hash: '0xeth', fee: 21000n }),
    waitForTransaction: async () => ({ finality: 'confirmed', success: true }),
    dispose: () => {}
  }
  class FakeWalletManager {
    async getAccount () { return account }
    dispose () {}
  }
  const sandbox = await createEphemeralSandbox(config, {
    WalletManager: FakeWalletManager,
    randomBytes: () => new Uint8Array(64)
  })

  await assert.rejects(sandbox.sweepEth('0xtreasury'), (error) => {
    assert.equal(error.partialSweep.amount, 79000n)
    assert.deepEqual(error.partialSweep.transactions, [
      { hash: '0xeth', amount: 79000n, fee: 21000n, status: 'confirmed' }
    ])
    return true
  })
  sandbox.dispose()
})

test('funding waits poll independent USDT and ETH balances', async () => {
  const usdt = [0n, 1000000n]
  const eth = [0n, 90000n]
  const options = { timeoutMs: 1000, pollMs: 1, sleep: async () => {} }
  assert.equal(await waitForSandboxFunding({
    getUsdtBalance: async () => usdt.shift()
  }, 1000000n, options), 1000000n)
  assert.equal(await waitForSandboxGas({
    getEthBalance: async () => eth.shift()
  }, 90000n, options), 90000n)
})

test('funding balance detection polls once per second by default', async () => {
  const balances = [0n, 1000000n]
  const delays = []
  assert.equal(await waitForSandboxFunding({
    getUsdtBalance: async () => balances.shift()
  }, 1000000n, {
    timeoutMs: 10000,
    sleep: async (delay) => delays.push(delay)
  }), 1000000n)
  assert.deepEqual(delays, [1000])
})

test('funding waits stop before a balance read when aborted', async () => {
  const controller = new AbortController()
  controller.abort('SIGTERM')
  let reads = 0

  await assert.rejects(waitForSandboxFunding({
    getUsdtBalance: async () => { reads++ }
  }, 1000000n, { signal: controller.signal }), (error) => error.signal === 'SIGTERM')
  assert.equal(reads, 0)
})

test('delegates and reclaims three isolated child balances without exposing parent funds', async () => {
  const seed = new Uint8Array(64).fill(11)
  const seeds = []
  const events = []
  const balances = new Map([
    ['0xroot', { usdt: 500000n, eth: 3000000n }],
    ['0xresearch', { usdt: 0n, eth: 0n }],
    ['0xpricing', { usdt: 0n, eth: 0n }],
    ['0xrisk', { usdt: 0n, eth: 0n }]
  ])
  let managerCount = 0
  let transactionCount = 0

  class LedgerWalletManager {
    constructor (receivedSeed) {
      const address = ['0xroot', '0xresearch', '0xpricing', '0xrisk'][managerCount++]
      seeds.push(receivedSeed)
      this.account = {
        getAddress: async () => address,
        getTokenBalance: async () => balances.get(address).usdt,
        getBalance: async () => balances.get(address).eth,
        quoteTransfer: async () => ({ fee: 40000n }),
        quoteSendTransaction: async () => ({ fee: 21000n }),
        transfer: async ({ recipient, amount }) => {
          const source = balances.get(address)
          const target = balances.get(recipient)
          assert.ok(source.usdt >= amount)
          assert.ok(source.eth >= 30000n)
          source.usdt -= amount
          source.eth -= 30000n
          target.usdt += amount
          const hash = `0xtoken${++transactionCount}`
          events.push(['usdt', address, recipient, amount, hash])
          return { hash, fee: 30000n }
        },
        sendTransaction: async ({ to, value }) => {
          const source = balances.get(address)
          const target = balances.get(to)
          assert.ok(source.eth >= value + 21000n)
          source.eth -= value + 21000n
          target.eth += value
          const hash = `0xeth${++transactionCount}`
          events.push(['eth', address, to, value, hash])
          return { hash, fee: 21000n }
        },
        waitForTransaction: async () => ({ finality: 'confirmed', success: true }),
        dispose: () => events.push(['account-disposed', address])
      }
    }

    async getAccount () { return this.account }
    dispose () {}
  }

  const treeUpdates = []
  const sandbox = await createEphemeralSandbox(config, {
    WalletManager: LedgerWalletManager,
    seed
  })

  await assert.rejects(sandbox.preflightDelegation([
    { name: 'a', amount: 200000n },
    { name: 'b', amount: 200000n },
    { name: 'c', amount: 200000n }
  ]), /Insufficient parent USDT balance/)
  assert.equal(events.length, 0)
  assert.equal(sandbox.getSandboxTree().nodes.length, 1)

  const child = await sandbox.delegateBudget({ name: 'research', amount: 200000n }, {
    onChange: async (tree) => treeUpdates.push(tree)
  })

  assert.equal(child.address, '0xresearch')
  assert.equal(child.gasReserveWei, '326250')
  assert.deepEqual(balances.get('0xroot'), { usdt: 300000n, eth: 2622750n })
  assert.deepEqual(balances.get('0xresearch'), { usdt: 200000n, eth: 326250n })
  assert.deepEqual(events.slice(0, 2).map((event) => event.slice(0, 4)), [
    ['eth', '0xroot', '0xresearch', 326250n],
    ['usdt', '0xroot', '0xresearch', 200000n]
  ])
  assert.notDeepEqual(seeds[0], seeds[1])
  assert.equal(seeds[0].every((byte) => byte === 11), true)
  assert.doesNotMatch(JSON.stringify(sandbox.getSandboxTree()), /seed|private.?key|keyPair/i)

  const closed = await sandbox.closeChild('research', {
    onChange: async (tree) => treeUpdates.push(tree)
  })

  assert.equal(closed.status, 'closed')
  assert.equal(closed.disposalStatus, 'disposed')
  assert.equal(closed.usdtReturnedToParentBaseUnits, '200000')
  assert.equal(closed.ethReturnedToParentWei, '275250')
  assert.deepEqual(balances.get('0xroot'), { usdt: 500000n, eth: 2898000n })
  assert.deepEqual(balances.get('0xresearch'), { usdt: 0n, eth: 0n })
  assert.deepEqual(events.slice(2, 4).map((event) => event.slice(0, 4)), [
    ['usdt', '0xresearch', '0xroot', 200000n],
    ['eth', '0xresearch', '0xroot', 275250n]
  ])
  assert.equal(seeds[1].every((byte) => byte === 0), true)
  assert.equal(treeUpdates.at(-1).nodes.find((node) => node.name === 'research').status, 'closed')

  const [pricing, risk] = await Promise.all([
    sandbox.delegateBudget({ name: 'pricing', amount: 100000n }),
    sandbox.delegateBudget({ name: 'risk', amount: 100000n })
  ])
  assert.deepEqual([pricing.id, risk.id], ['root/2', 'root/3'])
  assert.notDeepEqual(seeds[2], seeds[3])
  await assert.rejects(
    sandbox.delegateBudget({ name: 'fourth', amount: 10000n }),
    /at most 3 child sandboxes/
  )
  const closedChildren = await sandbox.closeChildren()
  assert.deepEqual(closedChildren.map((node) => node.name), ['pricing', 'risk'])
  assert.equal(closedChildren.every((node) =>
    node.status === 'closed' && node.cleanupStatus === 'closed'), true)
  assert.deepEqual(balances.get('0xroot'), { usdt: 500000n, eth: 2694000n })
  assert.equal(seeds.slice(1).every((childSeed) => childSeed.every((byte) => byte === 0)), true)

  sandbox.dispose()
  assert.equal(seed.every((byte) => byte === 0), true)
})
