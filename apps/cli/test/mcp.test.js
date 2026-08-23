import assert from 'node:assert/strict'
import test from 'node:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { USDT_ADDRESS } from '../src/config.js'
import { createReadOnlyMcpService } from '../src/mcp.js'
import { createEphemeralSandbox } from '../src/sandbox.js'

const config = {
  chainId: 11155111,
  provider: 'https://example.test',
  transferMaxFee: 5000000000000000n,
  transactionMaxFee: 5000000000000000n
}

function fakeWallet (events, seed, address = '0xEphemeral') {
  const account = {
    getAddress: async () => address,
    getBalance: async () => 226734168715460n,
    getTokenBalance: async (token) => {
      events.push(['token', token])
      return 500000n
    }
  }

  return class FakeWalletManager {
    constructor (receivedSeed, receivedConfig) {
      assert.equal(receivedSeed, seed)
      assert.equal(receivedConfig, config)
      events.push(['manager-created'])
    }

    async getAccount (index) {
      assert.equal(index, 0)
      return account
    }

    dispose () {
      events.push(['manager-disposed'])
    }
  }
}

test('serves only address and balance tools for the same ephemeral Sepolia EOA', async () => {
  const seed = new Uint8Array(64).fill(9)
  const events = []
  const service = await createReadOnlyMcpService(seed, config, '0xephemeral', {
    WalletManager: fakeWallet(events, seed)
  })
  const launch = service.configureLaunch('opencode', ['run'], {
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: 'test/model' })
  })
  const inline = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT)
  const command = inline.mcp.ration.command
  const transport = new StdioClientTransport({
    command: command[0],
    args: command.slice(1),
    stderr: 'pipe'
  })
  const client = new Client({ name: 'ration-test', version: '1.0.0' })

  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      'getAddress', 'getBalance', 'getTokenBalance'
    ])

    const address = await client.callTool({
      name: 'getAddress',
      arguments: { chain: 'sepolia' }
    })
    const eth = await client.callTool({
      name: 'getBalance',
      arguments: { chain: 'sepolia' }
    })
    const usdt = await client.callTool({
      name: 'getTokenBalance',
      arguments: { chain: 'sepolia', token: 'USDT' }
    })

    assert.deepEqual(address.structuredContent, { address: '0xEphemeral' })
    assert.deepEqual(eth.structuredContent, {
      balance: '226734168715460',
      balanceEth: '0.00022673416871546'
    })
    assert.equal(eth.content[0].text, 'Balance: 0.00022673416871546 Sepolia ETH (226734168715460 wei)')
    assert.deepEqual(usdt.structuredContent, { balance: '0.5', balanceRaw: '500000' })
    assert.deepEqual(events.filter((event) => event[0] === 'token'), [['token', USDT_ADDRESS]])
    assert.equal(inline.model, 'test/model')
    assert.equal(inline.mcp.ration.type, 'local')
  } finally {
    await client.close()
    await service.close()
  }

  assert.equal(events.at(-1)[0], 'manager-disposed')
  assert.equal(seed.every((byte) => byte === 9), true)
})

test('configures Codex transiently without putting wallet credentials in arguments', async () => {
  const seed = new Uint8Array(64).fill(4)
  const events = []
  const service = await createReadOnlyMcpService(seed, config, '0xephemeral', {
    WalletManager: fakeWallet(events, seed)
  })

  try {
    const launch = service.configureLaunch('/usr/local/bin/codex', ['exec', 'hello'], {})
    const joined = launch.args.join(' ')
    assert.match(joined, /mcp_servers\.ration\.command/)
    assert.match(joined, /getAddress.*getBalance.*getTokenBalance/)
    assert.doesNotMatch(joined, /rationtreasury/)
    assert.equal(joined.includes(Buffer.from(seed).toString('hex')), false)
    assert.deepEqual(launch.args.slice(-2), ['exec', 'hello'])
  } finally {
    await service.close()
  }
})

test('fails closed and disposes MCP WDK resources if its address differs', async () => {
  const seed = new Uint8Array(64).fill(3)
  const events = []
  await assert.rejects(createReadOnlyMcpService(seed, config, '0xexpected', {
    WalletManager: fakeWallet(events, seed, '0xother')
  }), /does not match/)
  assert.equal(events.at(-1)[0], 'manager-disposed')
})

test('the real WDK core and MCP Toolkit derive the same EOA from mutable seed bytes', async () => {
  const seed = new Uint8Array(64).fill(6)
  const sandbox = await createEphemeralSandbox({ chainId: 11155111 }, {
    randomBytes: () => seed
  })
  const service = await sandbox.openReadOnlyMcp()

  await service.close()
  assert.equal(seed.every((byte) => byte === 6), true)
  sandbox.dispose()
  assert.equal(seed.every((byte) => byte === 0), true)
})
