import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectStandardSepoliaConfig } from '../src/network.js'

const standardConfig = {
  chainId: 11155111,
  provider: 'https://ethereum-sepolia-rpc.publicnode.com',
  transferMaxFee: 5000000000000000
}

test('accepts the official standard Sepolia EVM configuration', () => {
  assert.deepEqual(inspectStandardSepoliaConfig(standardConfig), {
    ready: true,
    walletConfig: {
      chainId: 11155111,
      provider: standardConfig.provider,
      transferMaxFee: 5000000000000000n,
      transactionMaxFee: 5000000000000000n
    }
  })
})

test('accepts official WDK provider failover arrays', () => {
  assert.equal(inspectStandardSepoliaConfig({
    ...standardConfig,
    provider: ['https://one.example', 'https://two.example']
  }).ready, true)
})

test('rejects wrong chains, missing fee safety, and account abstraction fields', () => {
  for (const config of [
    { ...standardConfig, chainId: 1 },
    { ...standardConfig, provider: '' },
    { ...standardConfig, transferMaxFee: 0 },
    { ...standardConfig, bundlerUrl: 'https://bundler.example' },
    { ...standardConfig, paymasterToken: { address: '0xtoken' } },
    { ...standardConfig, isSponsored: false }
  ]) assert.equal(inspectStandardSepoliaConfig(config).ready, false)
})
