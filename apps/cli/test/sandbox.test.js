import assert from 'node:assert/strict'
import test from 'node:test'

import { createEphemeralSandbox, waitForSandboxFunding } from '../src/sandbox.js'

const config = {
  chainId: 11155111,
  provider: 'https://example.test',
  bundlerUrl: 'https://example.test/bundler',
  paymasterUrl: 'https://example.test/paymaster',
  paymasterAddress: '0xpaymaster',
  safeModulesVersion: '0.3.0',
  paymasterToken: { address: '0xtoken' },
  transferMaxFee: 100000n
}

test('ephemeral sandbox keeps mutable seed bytes in memory and zeroes them on disposal', async () => {
  const events = []
  const seed = new Uint8Array(64).fill(7)
  const account = {
    getAddress: async () => '0xephemeral',
    getTokenBalance: async () => 0n,
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

    dispose () {
      events.push('wallet-dispose')
    }
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

test('ephemeral sandbox reserves the quoted token fee, sweeps, and waits for confirmation', async () => {
  const quotes = []
  let transfer
  let balance = 1000000n
  const account = {
    getAddress: async () => '0xephemeral',
    getTokenBalance: async () => balance,
    quoteTransfer: async (input) => {
      quotes.push(input)
      return { fee: 50000n }
    },
    transfer: async (input) => {
      transfer = input
      balance = 0n
      return { hash: '0xhash', fee: 50000n }
    },
    waitForTransaction: async (hash, options) => {
      assert.equal(hash, '0xhash')
      assert.equal(options.target, 'confirmed')
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

  const result = await sandbox.sweep('0xtreasury')
  assert.equal(quotes[0].amount, 1n)
  assert.equal(quotes[1].amount, 950000n)
  assert.deepEqual(transfer, {
    token: '0xtoken',
    recipient: '0xtreasury',
    amount: 950000n
  })
  assert.equal(result.amount, 950000n)
  sandbox.dispose()
})

test('funding wait polls until the exact budget is visible', async () => {
  const balances = [0n, 500000n, 1000000n]
  let sleeps = 0
  const balance = await waitForSandboxFunding({
    getBalance: async () => balances.shift()
  }, 1000000n, {
    timeoutMs: 1000,
    pollMs: 1,
    sleep: async () => { sleeps++ }
  })

  assert.equal(balance, 1000000n)
  assert.equal(sleeps, 2)
})

test('funding wait stops before another balance read when aborted', async () => {
  const controller = new AbortController()
  controller.abort('SIGTERM')
  let reads = 0

  await assert.rejects(waitForSandboxFunding({
    getBalance: async () => { reads++ }
  }, 1000000n, { signal: controller.signal }), (error) => error.signal === 'SIGTERM')
  assert.equal(reads, 0)
})
