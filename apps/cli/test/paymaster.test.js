import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectPaymasterTokenConfig, paymasterTokenFee } from '../src/paymaster.js'

const publicEndpoint = 'https://api.candide.dev/public/v3/11155111'
const paymasterTokenConfig = {
  chainId: 11155111,
  provider: 'https://sepolia.gateway.tenderly.co',
  bundlerUrl: publicEndpoint,
  paymasterUrl: publicEndpoint,
  paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
  paymasterToken: {
    address: '0xd077a400968890eacc75cdc901f0356c943e4fdb'
  },
  transferMaxFee: 100000
}

test('accepts the official public Candide Sepolia Paymaster Token configuration', () => {
  assert.deepEqual(inspectPaymasterTokenConfig({
    ...paymasterTokenConfig,
    bundlerUrl: `${publicEndpoint}/`,
    paymasterUrl: publicEndpoint
  }), {
    ready: true,
    transferMaxFee: 100000n
  })
})

test('rejects legacy, authenticated, sponsored, and incorrect token configurations', () => {
  for (const config of [
    {
      ...paymasterTokenConfig,
      bundlerUrl: 'https://api.candide.dev/public/v3/sepolia',
      paymasterUrl: 'https://api.candide.dev/public/v3/sepolia'
    },
    {
      ...paymasterTokenConfig,
      bundlerUrl: 'https://api.candide.dev/api/v3/11155111/test-key',
      paymasterUrl: 'https://api.candide.dev/api/v3/11155111/test-key'
    },
    {
      ...paymasterTokenConfig,
      isSponsored: true
    },
    {
      ...paymasterTokenConfig,
      paymasterToken: { address: '0x0000000000000000000000000000000000000000' }
    }
  ]) {
    assert.deepEqual(inspectPaymasterTokenConfig(config), { ready: false })
  }
})

test('parses only positive token-denominated WDK fee previews', () => {
  assert.equal(paymasterTokenFee({ estimatedFee: '50000' }), 50000n)
  assert.equal(paymasterTokenFee({ estimatedFee: '0' }), null)
  assert.equal(paymasterTokenFee({ estimatedFee: '1.5' }), null)
  assert.equal(paymasterTokenFee({}), null)
})
