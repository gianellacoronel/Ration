import assert from 'node:assert/strict'
import test from 'node:test'

import { USDT_ADDRESS } from '../src/config.js'
import {
  createEphemeralSandbox,
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
      events.push(['confirm', hash, options.target])
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

test('funding waits stop before a balance read when aborted', async () => {
  const controller = new AbortController()
  controller.abort('SIGTERM')
  let reads = 0

  await assert.rejects(waitForSandboxFunding({
    getUsdtBalance: async () => { reads++ }
  }, 1000000n, { signal: controller.signal }), (error) => error.signal === 'SIGTERM')
  assert.equal(reads, 0)
})
