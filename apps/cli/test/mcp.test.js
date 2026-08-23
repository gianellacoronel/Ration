import assert from 'node:assert/strict'
import test from 'node:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { USDT_ADDRESS } from '../src/config.js'
import { createSandboxMcpService } from '../src/mcp.js'
import { createEphemeralSandbox } from '../src/sandbox.js'

const config = {
  chainId: 11155111,
  provider: 'https://example.test',
  transferMaxFee: 5000000000000000n,
  transactionMaxFee: 5000000000000000n
}

const DEMO_ORIGIN = 'https://demo.ration.test'
const DEMO_SELLER = '0x1111111111111111111111111111111111111111'

function demoCatalog () {
  return {
    seller: { address: DEMO_SELLER },
    network: { name: 'sepolia', chainId: 11155111 },
    token: { symbol: 'USDT', address: USDT_ADDRESS, decimals: 6 },
    resources: [
      {
        id: 'market-snapshot',
        name: 'Market snapshot',
        description: 'Market size, drivers, competitors, and risks.',
        provides: ['market metrics', 'competitor positioning'],
        method: 'GET',
        path: '/api/demo/market-snapshot',
        price: { amount: '0.01', amountBaseUnits: '10000', currency: 'USDT', decimals: 6 }
      },
      {
        id: 'company-intel',
        name: 'Company intelligence',
        description: 'Company profile, financing, leadership, and signals.',
        provides: ['company profile', 'funding and leadership'],
        method: 'GET',
        path: '/api/demo/company-intel',
        price: { amount: '0.03', amountBaseUnits: '30000', currency: 'USDT', decimals: 6 }
      },
      {
        id: 'deep-research',
        name: 'Deep research',
        description: 'Commercial evidence, economics, risks, and diligence questions.',
        provides: ['commercial metrics', 'risk analysis'],
        method: 'GET',
        path: '/api/demo/deep-research',
        price: { amount: '0.06', amountBaseUnits: '60000', currency: 'USDT', decimals: 6 }
      },
      {
        id: 'premium-dataset',
        name: 'Premium dataset',
        description: 'Normalized vendor and deployment records.',
        provides: ['vendor benchmarks', 'deployment records'],
        method: 'GET',
        path: '/api/demo/premium-dataset',
        price: { amount: '0.5', amountBaseUnits: '500000', currency: 'USDT', decimals: 6 }
      }
    ]
  }
}

function demoPaymentRequired (amount = '0.06', amountBaseUnits = '60000') {
  return {
    paymentRequired: true,
    error: { code: 'payment_required', message: 'Payment required.' },
    payment: {
      scheme: 'usdt-transfer',
      network: { name: 'sepolia', chainId: 11155111 },
      token: { symbol: 'USDT', address: USDT_ADDRESS, decimals: 6 },
      payToAddress: DEMO_SELLER,
      amount,
      amountBaseUnits
    }
  }
}

function jsonResponse (status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function fakeWallet (events, seed, address = '0xEphemeral') {
  let tokenBalance = 100000n
  let transferCount = 0
  const account = {
    getAddress: async () => address,
    getBalance: async () => 226734168715460n,
    getTokenBalance: async (token) => {
      events.push(['token', token])
      return tokenBalance
    },
    quoteTransfer: async (options) => {
      events.push(['quote-transfer', options])
      return { fee: 42000n }
    },
    transfer: async (options) => {
      events.push(['transfer', options])
      tokenBalance -= options.amount
      transferCount++
      return { hash: transferCount === 1 ? '0xpayment' : `0xpayment${transferCount}`, fee: 41000n }
    },
    waitForTransaction: async (hash, options) => {
      events.push(['confirmed', hash, options])
      return { finality: 'confirmed', success: true }
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

test('serves the existing reads and confirmed Sepolia USDT transfer for the same ephemeral EOA', async () => {
  const seed = new Uint8Array(64).fill(9)
  const events = []
  const confirmations = []
  const service = await createSandboxMcpService(seed, config, '0xephemeral', {
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
  const client = new Client({ name: 'ration-test', version: '1.0.0' }, {
    capabilities: { elicitation: {} }
  })
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    confirmations.push(request.params)
    return { action: 'accept', content: { confirmed: true } }
  })

  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      'getAddress', 'getBalance', 'getTokenBalance', 'ration_getCatalog',
      'ration_getRemainingBalance', 'ration_purchaseResource', 'transfer'
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
    const unsupported = await client.callTool({
      name: 'transfer',
      arguments: { chain: 'sepolia', token: 'USDC', to: '0xRecipient', amount: '0.05' }
    })
    const payment = await client.callTool({
      name: 'transfer',
      arguments: { chain: 'sepolia', token: 'USDT', to: '0xRecipient', amount: '0.05' }
    })

    assert.deepEqual(address.structuredContent, { address: '0xEphemeral' })
    assert.deepEqual(eth.structuredContent, {
      balance: '226734168715460',
      balanceEth: '0.00022673416871546'
    })
    assert.equal(eth.content[0].text, 'Balance: 0.00022673416871546 Sepolia ETH (226734168715460 wei)')
    assert.deepEqual(usdt.structuredContent, { balance: '0.1', balanceRaw: '100000' })
    assert.equal(unsupported.isError, true)
    assert.match(unsupported.content[0].text, /Token "USDC" not registered/)
    assert.deepEqual(payment.structuredContent, { hash: '0xpayment', fee: '41000' })
    assert.deepEqual(events.filter((event) => event[0] === 'token'), [['token', USDT_ADDRESS]])
    assert.deepEqual(events.filter((event) => event[0] === 'quote-transfer'), [[
      'quote-transfer',
      { token: USDT_ADDRESS, recipient: '0xRecipient', amount: 50000n }
    ]])
    assert.deepEqual(events.filter((event) => event[0] === 'transfer'), [[
      'transfer',
      { token: USDT_ADDRESS, recipient: '0xRecipient', amount: 50000n }
    ]])
    assert.deepEqual(events.filter((event) => event[0] === 'confirmed'), [[
      'confirmed',
      '0xpayment',
      { target: 'confirmed', timeout: 180000, interval: 1000 }
    ]])
    assert.equal(confirmations.length, 1)
    assert.match(confirmations[0].message, /Amount: 0\.05 USDT \(50000 base units\)/)
    assert.match(confirmations[0].message, /Estimated Fee: 42000/)
    assert.equal(inline.model, 'test/model')
    assert.equal(inline.mcp.ration.type, 'local')
    assert.doesNotMatch(launch.env.OPENCODE_CONFIG_CONTENT, /rationtreasury/)
    assert.equal(launch.env.OPENCODE_CONFIG_CONTENT.includes(Buffer.from(seed).toString('hex')), false)
  } finally {
    await client.close()
    await service.close()
  }

  assert.equal(events.at(-1)[0], 'manager-disposed')
  assert.equal(seed.every((byte) => byte === 9), true)
})

test('does not broadcast a USDT transfer when Toolkit confirmation is declined', async () => {
  const seed = new Uint8Array(64).fill(8)
  const events = []
  const service = await createSandboxMcpService(seed, config, '0xephemeral', {
    WalletManager: fakeWallet(events, seed)
  })
  const launch = service.configureLaunch('opencode', [], {})
  const command = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT).mcp.ration.command
  const transport = new StdioClientTransport({
    command: command[0],
    args: command.slice(1),
    stderr: 'pipe'
  })
  const client = new Client({ name: 'ration-test', version: '1.0.0' }, {
    capabilities: { elicitation: {} }
  })
  client.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'decline' }))

  try {
    await client.connect(transport)
    const result = await client.callTool({
      name: 'transfer',
      arguments: { chain: 'sepolia', token: 'USDT', to: '0xRecipient', amount: '0.05' }
    })

    assert.equal(result.isError, true)
    assert.equal(events.filter((event) => event[0] === 'quote-transfer').length, 1)
    assert.equal(events.some((event) => event[0] === 'transfer'), false)
    assert.equal(events.some((event) => event[0] === 'confirmed'), false)
  } finally {
    await client.close()
    await service.close()
  }
})

test('catalog discovery and consecutive purchases need no manual payment details or elicitation', async () => {
  const seed = new Uint8Array(64).fill(7)
  const events = []
  const responses = [
    jsonResponse(200, demoCatalog()),
    jsonResponse(200, demoCatalog()),
    jsonResponse(402, demoPaymentRequired()),
    jsonResponse(200, { resource: 'deep-research', research: { company: 'Acme' } }),
    jsonResponse(200, demoCatalog()),
    jsonResponse(402, demoPaymentRequired('0.01', '10000')),
    jsonResponse(200, { resource: 'market-snapshot', snapshot: { market: 'Warehousing' } }),
    jsonResponse(200, demoCatalog()),
    jsonResponse(402, demoPaymentRequired('0.03', '30000')),
    jsonResponse(200, { resource: 'company-intel', intel: { company: 'Acme' } })
  ]
  const service = await createSandboxMcpService(seed, config, '0xephemeral', {
    WalletManager: fakeWallet(events, seed),
    resolveDemoOrigin: () => DEMO_ORIGIN,
    fetchImpl: async () => responses.shift()
  })
  const launch = service.configureLaunch('opencode', [], {})
  const command = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT).mcp.ration.command
  const transport = new StdioClientTransport({
    command: command[0],
    args: command.slice(1),
    stderr: 'pipe'
  })
  const client = new Client({ name: 'ration-test', version: '1.0.0' })

  try {
    await client.connect(transport)
    const discovered = await client.callTool({ name: 'ration_getCatalog', arguments: {} })
    const balanceBefore = await client.callTool({
      name: 'ration_getRemainingBalance', arguments: {}
    })
    const purchased = await client.callTool({
      name: 'ration_purchaseResource',
      arguments: { resourceId: 'deep-research' }
    })
    const secondPurchase = await client.callTool({
      name: 'ration_purchaseResource',
      arguments: { resourceId: 'market-snapshot' }
    })
    const parallelPurchases = await Promise.all([
      client.callTool({
        name: 'ration_purchaseResource', arguments: { resourceId: 'company-intel' }
      }),
      client.callTool({
        name: 'ration_purchaseResource', arguments: { resourceId: 'company-intel' }
      })
    ])
    const balanceAfter = await client.callTool({
      name: 'ration_getRemainingBalance', arguments: {}
    })

    assert.match(discovered.content[0].text, /deep-research:[\s\S]*Price: 0\.06 USDT/)
    assert.match(discovered.content[0].text, /premium-dataset:[\s\S]*Price: 0\.5 USDT/)
    assert.deepEqual(balanceBefore.structuredContent, {
      balance: '0.10', balanceBaseUnits: '100000', currency: 'USDT', decimals: 6
    })
    assert.deepEqual(purchased.structuredContent, {
      purchased: true,
      resource: 'deep-research',
      paidBaseUnits: '60000',
      txHash: '0xpayment',
      payload: { resource: 'deep-research', research: { company: 'Acme' } }
    })
    assert.deepEqual(balanceAfter.structuredContent, {
      balance: '0.00', balanceBaseUnits: '0', currency: 'USDT', decimals: 6
    })
    assert.deepEqual(secondPurchase.structuredContent, {
      purchased: true,
      resource: 'market-snapshot',
      paidBaseUnits: '10000',
      txHash: '0xpayment2',
      payload: { resource: 'market-snapshot', snapshot: { market: 'Warehousing' } }
    })
    assert.equal(parallelPurchases.every((result) =>
      result.structuredContent.payload.resource === 'company-intel'), true)
    assert.deepEqual(events.filter((event) => event[0] === 'transfer'), [
      ['transfer', { token: USDT_ADDRESS, recipient: DEMO_SELLER, amount: 60000n }],
      ['transfer', { token: USDT_ADDRESS, recipient: DEMO_SELLER, amount: 10000n }],
      ['transfer', { token: USDT_ADDRESS, recipient: DEMO_SELLER, amount: 30000n }]
    ])
    assert.equal(events.some((event) => event[0] === 'quote-transfer'), false)
    assert.deepEqual(events.filter((event) => event[0] === 'confirmed'), [
      ['confirmed', '0xpayment', { target: 'confirmed', timeout: 180000, interval: 1000 }],
      ['confirmed', '0xpayment2', { target: 'confirmed', timeout: 180000, interval: 1000 }],
      ['confirmed', '0xpayment3', { target: 'confirmed', timeout: 180000, interval: 1000 }]
    ])
  } finally {
    await client.close()
    await service.close()
  }
})

test('configures Codex transiently without putting wallet credentials in arguments', async () => {
  const seed = new Uint8Array(64).fill(4)
  const events = []
  const service = await createSandboxMcpService(seed, config, '0xephemeral', {
    WalletManager: fakeWallet(events, seed)
  })

  try {
    const launch = service.configureLaunch('/usr/local/bin/codex', ['exec', 'hello'], {})
    const joined = launch.args.join(' ')
    const enabledTools = launch.args.find((arg) => arg.startsWith('mcp_servers.ration.enabled_tools='))
    assert.match(joined, /mcp_servers\.ration\.command/)
    assert.equal(enabledTools, 'mcp_servers.ration.enabled_tools=["getAddress","getBalance","getTokenBalance","transfer","ration_getRemainingBalance","ration_getCatalog","ration_purchaseResource"]')
    assert.equal(launch.args.includes('mcp_servers.ration.tool_timeout_sec=240'), true)
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
  await assert.rejects(createSandboxMcpService(seed, config, '0xexpected', {
    WalletManager: fakeWallet(events, seed, '0xother')
  }), /does not match/)
  assert.equal(events.at(-1)[0], 'manager-disposed')
})

test('the real WDK core and MCP Toolkit derive the same EOA from mutable seed bytes', async () => {
  const seed = new Uint8Array(64).fill(6)
  const sandbox = await createEphemeralSandbox({ chainId: 11155111 }, {
    randomBytes: () => seed
  })
  const service = await sandbox.openMcp()

  await service.close()
  assert.equal(seed.every((byte) => byte === 6), true)
  sandbox.dispose()
  assert.equal(seed.every((byte) => byte === 0), true)
})
