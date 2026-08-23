import assert from 'node:assert/strict'
import test from 'node:test'

import { USDT_ADDRESS } from '../src/config.js'
import {
  DemoPaymentError,
  joinDemoResourceUrl,
  parseCatalogPayload,
  parsePaymentRequirements,
  purchaseResourceViaDemoApi,
  resolveDemoOrigin
} from '../src/demo.js'

const ORIGIN = 'https://demo.ration.test'
const SELLER = '0x1111111111111111111111111111111111111111'
const TX_HASH = `0x${'a'.repeat(64)}`

function catalog (overrides = {}) {
  return {
    seller: { address: SELLER, label: 'Ration demo seller' },
    network: { name: 'sepolia', chainId: 11155111 },
    token: { symbol: 'USDT', address: USDT_ADDRESS, decimals: 6 },
    resources: [{
      id: 'company-intel',
      name: 'Company intelligence report',
      method: 'GET',
      path: '/api/demo/company-intel',
      price: {
        amount: '0.02',
        amountBaseUnits: '20000',
        currency: 'USDT',
        decimals: 6
      }
    }],
    ...overrides
  }
}

function paymentRequired (overrides = {}) {
  return {
    paymentRequired: true,
    error: { code: 'payment_required', message: 'Payment required.' },
    payment: {
      scheme: 'usdt-transfer',
      network: { name: 'sepolia', chainId: 11155111 },
      token: { symbol: 'USDT', address: USDT_ADDRESS, decimals: 6 },
      payToAddress: SELLER,
      amount: '0.02',
      amountBaseUnits: '20000',
      ...overrides
    }
  }
}

function response (status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

test('purchases the catalog resource with the sandbox account and retries with its confirmed hash', async () => {
  const requests = []
  const events = []
  const replies = [
    response(200, catalog()),
    response(402, paymentRequired()),
    response(402, {
      ...paymentRequired(),
      error: { code: 'tx_not_found', message: 'Not indexed yet.' }
    }),
    response(200, { resource: 'company-intel', intel: { company: 'Acme' } })
  ]
  const account = {
    getTokenBalance: async (token) => {
      events.push(['balance', token])
      return 100000n
    },
    transfer: async (options) => {
      events.push(['transfer', options])
      return { hash: TX_HASH, fee: 123n }
    },
    waitForTransaction: async (hash, options) => {
      events.push(['confirm', hash, options])
      return { finality: 'confirmed', success: true }
    }
  }

  const result = await purchaseResourceViaDemoApi({
    origin: ORIGIN,
    resourceId: 'company-intel',
    account,
    fetchImpl: async (url, options) => {
      requests.push([url, options])
      return replies.shift()
    },
    wait: async (delay) => events.push(['wait', delay])
  })

  assert.deepEqual(result, {
    payload: { resource: 'company-intel', intel: { company: 'Acme' } },
    paidBaseUnits: 20000n,
    txHash: TX_HASH
  })
  assert.deepEqual(events, [
    ['balance', USDT_ADDRESS],
    ['transfer', { token: USDT_ADDRESS, recipient: SELLER, amount: 20000n }],
    ['confirm', TX_HASH, { target: 'confirmed', timeout: 120000 }],
    ['wait', 500]
  ])
  assert.deepEqual(requests.map(([url]) => url), [
    `${ORIGIN}/api/demo/catalog`,
    `${ORIGIN}/api/demo/company-intel`,
    `${ORIGIN}/api/demo/company-intel`,
    `${ORIGIN}/api/demo/company-intel`
  ])
  assert.equal(requests.every(([, options]) => options.redirect === 'error'), true)
  assert.equal(requests[2][1].headers['x-payment-tx-hash'], TX_HASH)
  assert.equal(requests[3][1].headers['x-payment-tx-hash'], TX_HASH)
})

test('rejects payment requirements that differ from the validated catalog', () => {
  const parsedCatalog = parseCatalogPayload(catalog())
  const expected = {
    payToAddress: parsedCatalog.seller.address,
    amountBaseUnits: BigInt(parsedCatalog.resources[0].price.amountBaseUnits)
  }

  assert.throws(() => parsePaymentRequirements(paymentRequired({
    payToAddress: '0x2222222222222222222222222222222222222222'
  }), expected), /recipient does not match/)
  assert.throws(() => parsePaymentRequirements(paymentRequired({
    amount: '0.03',
    amountBaseUnits: '30000'
  }), expected), /amount does not match/)
  assert.throws(() => parsePaymentRequirements(paymentRequired({
    token: { symbol: 'USDT', address: '0x2222222222222222222222222222222222222222', decimals: 6 }
  }), expected), /official Sepolia test/)
})

test('checks the sandbox balance before broadcasting', async () => {
  let transferred = false
  const replies = [response(200, catalog()), response(402, paymentRequired())]
  await assert.rejects(purchaseResourceViaDemoApi({
    origin: ORIGIN,
    resourceId: 'company-intel',
    account: {
      getTokenBalance: async () => 19999n,
      transfer: async () => { transferred = true }
    },
    fetchImpl: async () => replies.shift()
  }), (error) => error instanceof DemoPaymentError &&
    error.code === 'insufficient_sandbox_balance')
  assert.equal(transferred, false)
})

test('keeps catalog resource paths and API requests on the configured origin', async () => {
  assert.throws(() => joinDemoResourceUrl(ORIGIN, '//evil.example/resource'), /off the configured origin/)
  assert.equal(resolveDemoOrigin({ RATION_DEMO_API_URL: `${ORIGIN}/ignored/path` }), ORIGIN)
  assert.throws(() => resolveDemoOrigin({ RATION_DEMO_API_URL: 'https://user:secret@demo.ration.test' }),
    /must not contain credentials/)

  let requests = 0
  await assert.rejects(purchaseResourceViaDemoApi({
    origin: ORIGIN,
    resourceId: 'company-intel',
    account: {},
    fetchImpl: async () => {
      requests++
      return response(200, catalog({
        resources: [{ ...catalog().resources[0], path: '//evil.example/resource' }]
      }))
    }
  }), /off the configured origin/)
  assert.equal(requests, 1)
})
