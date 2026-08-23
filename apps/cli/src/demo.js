import { USDT_ADDRESS } from './config.js'
import { parseUsdt } from './domain.js'

export const DEFAULT_DEMO_ORIGIN = 'http://localhost:3000'
export const DEMO_CHAIN_ID = 11155111
export const PAYMENT_TX_HEADER = 'x-payment-tx-hash'
export const DEMO_RESOURCE_PATHS = Object.freeze({
  'market-snapshot': '/api/demo/market-snapshot',
  'company-intel': '/api/demo/company-intel',
  'deep-research': '/api/demo/deep-research',
  'premium-dataset': '/api/demo/premium-dataset'
})
export const MAX_DEMO_RESOURCE_PURCHASES = Object.keys(DEMO_RESOURCE_PATHS).length

const REQUEST_TIMEOUT_MS = 15000
const CONFIRM_TIMEOUT_MS = 120000
const CONFIRM_POLL_MS = 1000
const RETRY_DELAYS_MS = [500, 2000, 4000, 8000]
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/

export class DemoPaymentError extends Error {
  constructor (message, { code, txHash } = {}) {
    super(message)
    this.name = 'DemoPaymentError'
    this.code = code ?? 'demo_purchase_failed'
    this.txHash = txHash
  }
}

export function resolveDemoOrigin (env = process.env) {
  const raw = (env.RATION_DEMO_API_URL ?? '').trim() || DEFAULT_DEMO_ORIGIN
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new DemoPaymentError('RATION_DEMO_API_URL is not a valid URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DemoPaymentError('RATION_DEMO_API_URL must use http or https.')
  }
  if (url.username || url.password) {
    throw new DemoPaymentError('RATION_DEMO_API_URL must not contain credentials.')
  }
  return url.origin
}

function requireObject (value, what) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DemoPaymentError(`The demo server returned an unexpected ${what}.`)
  }
  return value
}

function sameUsdtAddress (value) {
  return typeof value === 'string' && value.toLowerCase() === USDT_ADDRESS.toLowerCase()
}

function validRecipient (value) {
  return typeof value === 'string' && HEX_ADDRESS.test(value) && !/^0x0{40}$/i.test(value)
}

/**
 * Validates the catalog against the expected Sepolia test USDT setup. Only
 * resources on the configured origin with relative paths are accepted; the
 * origin itself is enforced by the caller.
 */
export function parseCatalogPayload (payload) {
  const body = requireObject(payload, 'catalog')
  if (!body.seller || !validRecipient(body.seller.address)) {
    throw new DemoPaymentError('The demo catalog has no valid seller address.')
  }
  if (!body.network || body.network.chainId !== DEMO_CHAIN_ID ||
    String(body.network.name ?? '').toLowerCase() !== 'sepolia') {
    throw new DemoPaymentError('The demo catalog does not target Sepolia.')
  }
  if (!sameUsdtAddress(body.token?.address) || body.token.decimals !== 6 ||
    String(body.token.symbol ?? '').toUpperCase() !== 'USDT') {
    throw new DemoPaymentError('The demo catalog does not list the official Sepolia test USDT.')
  }
  if (!Array.isArray(body.resources) || body.resources.length === 0) {
    throw new DemoPaymentError('The demo catalog lists no resources.')
  }
  const resourceIds = new Set()
  for (const resource of body.resources) {
    if (!resource || typeof resource.id !== 'string' ||
      resource.id.length === 0 || resourceIds.has(resource.id) ||
      DEMO_RESOURCE_PATHS[resource.id] !== resource.path ||
      typeof resource.description !== 'string' || resource.description.length === 0 ||
      !Array.isArray(resource.provides) || resource.provides.length === 0 ||
      resource.provides.some((item) => typeof item !== 'string' || item.length === 0) ||
      typeof resource.path !== 'string' || !resource.path.startsWith('/') ||
      resource.method !== 'GET') {
      throw new DemoPaymentError('The demo catalog contains a malformed resource entry.')
    }
    resourceIds.add(resource.id)
    const price = requireObject(resource.price, 'catalog price')
    if (!/^\d+$/.test(price.amountBaseUnits ?? '') || BigInt(price.amountBaseUnits) <= 0n) {
      throw new DemoPaymentError('The demo catalog contains a malformed resource price.')
    }
    if (typeof price.amount !== 'string' || parseUsdt(price.amount) !== BigInt(price.amountBaseUnits) ||
      String(price.currency ?? '').toUpperCase() !== 'USDT' || price.decimals !== 6) {
      throw new DemoPaymentError('The demo catalog contains inconsistent resource pricing.')
    }
  }
  return body
}

function unlockedPayload (payload, resourceId, txHash) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
    payload.resource !== resourceId) {
    throw new DemoPaymentError(
      `The demo server returned a payload for a different resource than "${resourceId}".`,
      { txHash })
  }
  return payload
}

/**
 * Validates the server's 402 payment requirements. The payment values used to
 * spend always come from this validated block, never from the agent or from
 * any auxiliary fields.
 */
export function parsePaymentRequirements (payload, expected = {}) {
  const body = requireObject(payload, 'payment requirement response')
  if (body.paymentRequired !== true) {
    throw new DemoPaymentError('The demo server did not request a payment.')
  }
  const code = typeof body.error?.code === 'string' ? body.error.code : 'unknown'
  const payment = requireObject(body.payment, 'payment requirements')
  if (payment.scheme !== 'usdt-transfer') {
    throw new DemoPaymentError('The demo server requested an unsupported payment scheme.', { code })
  }
  if (!payment.network || payment.network.chainId !== DEMO_CHAIN_ID) {
    throw new DemoPaymentError('The demo payment request does not target Sepolia.', { code })
  }
  const token = requireObject(payment.token, 'payment token')
  if (!sameUsdtAddress(token.address) || token.decimals !== 6 ||
    String(token.symbol ?? '').toUpperCase() !== 'USDT') {
    throw new DemoPaymentError(
      'The demo payment request does not use the official Sepolia test USD₮.', { code })
  }
  if (!/^\d+$/.test(payment.amountBaseUnits ?? '') || BigInt(payment.amountBaseUnits) <= 0n) {
    throw new DemoPaymentError('The demo payment request has an invalid amount.', { code })
  }
  const amountBaseUnits = BigInt(payment.amountBaseUnits)
  if (typeof payment.amount !== 'string' || parseUsdt(payment.amount) !== amountBaseUnits) {
    throw new DemoPaymentError(
      'The demo payment request amounts disagree between display and base units.', { code })
  }
  if (!validRecipient(payment.payToAddress)) {
    throw new DemoPaymentError('The demo payment request has an invalid recipient address.', { code })
  }
  if (expected.payToAddress &&
    payment.payToAddress.toLowerCase() !== expected.payToAddress.toLowerCase()) {
    throw new DemoPaymentError('The demo payment recipient does not match the catalog seller.', { code })
  }
  if (expected.amountBaseUnits !== undefined && amountBaseUnits !== expected.amountBaseUnits) {
    throw new DemoPaymentError('The demo payment amount does not match the catalog price.', { code })
  }
  return {
    payToAddress: payment.payToAddress.toLowerCase(),
    amountBaseUnits,
    serverCode: code
  }
}

/**
 * Locks the resource path to the configured origin. Paths come from the
 * catalog response, so they must never be allowed to change host.
 */
export function joinDemoResourceUrl (origin, path) {
  let resolved
  try {
    resolved = new URL(path, origin)
  } catch {
    throw new DemoPaymentError('The demo catalog contains an invalid resource path.')
  }
  if (resolved.origin !== new URL(origin).origin) {
    throw new DemoPaymentError('The demo catalog tried to redirect a resource off the configured origin.')
  }
  return resolved.toString()
}

async function requestJson (fetchImpl, url, options = {}) {
  let response
  try {
    response = await fetchImpl(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    throw new DemoPaymentError(`Could not reach the demo API at ${new URL(url).origin}: ${error.message}`)
  }
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function formatUsdt (amountBaseUnits) {
  const integer = amountBaseUnits / 1000000n
  const fraction = (amountBaseUnits % 1000000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${integer}.${fraction || '0'}`
}

/**
 * Discovers the resource in the catalog, requests it, validates the server's
 * 402 requirements, pays from the sandbox's own ephemeral EOA, waits for the
 * transaction to confirm, then retries with the transaction hash until the
 * protected payload unlocks.
 */
export async function purchaseResourceViaDemoApi ({
  origin,
  resourceId,
  account,
  fetchImpl = fetch,
  wait = sleep,
  transferWaitsForConfirmation = false
}) {
  const catalogResponse = await requestJson(fetchImpl, `${origin}/api/demo/catalog`)
  if (catalogResponse.status !== 200) {
    throw new DemoPaymentError(`The demo catalog returned HTTP ${catalogResponse.status}.`)
  }
  const catalog = parseCatalogPayload(catalogResponse.body)
  const resource = catalog.resources.find((entry) => entry.id === resourceId)
  if (!resource) {
    throw new DemoPaymentError(
      `Unknown resource "${resourceId}". Available: ${catalog.resources.map((entry) => entry.id).join(', ')}.`,
      { code: 'unknown_resource' })
  }
  const resourceUrl = joinDemoResourceUrl(origin, resource.path)

  const first = await requestJson(fetchImpl, resourceUrl)
  if (first.status === 200) {
    return { payload: unlockedPayload(first.body, resourceId), paidBaseUnits: 0n, txHash: undefined }
  }
  if (first.status !== 402) {
    throw new DemoPaymentError(`The demo API returned unexpected HTTP ${first.status} for ${resource.path}.`)
  }
  const requirements = parsePaymentRequirements(first.body, {
    payToAddress: catalog.seller.address,
    amountBaseUnits: BigInt(resource.price.amountBaseUnits)
  })

  const balance = await account.getTokenBalance(USDT_ADDRESS)
  if (balance < requirements.amountBaseUnits) {
    throw new DemoPaymentError(
      `Insufficient sandbox USD₮: available ${formatUsdt(balance)}, required ${formatUsdt(requirements.amountBaseUnits)}.`,
      { code: 'insufficient_sandbox_balance' })
  }

  // Pays from the same ephemeral EOA already attached to this session.
  const payment = await account.transfer({
    token: USDT_ADDRESS,
    recipient: requirements.payToAddress,
    amount: requirements.amountBaseUnits
  })

  // MCP wraps transfers with its own confirmation wait so low-level and
  // autonomous transfers share one in-flight operation during shutdown.
  if (!transferWaitsForConfirmation) {
    const receipt = await account.waitForTransaction(payment.hash, {
      target: 'confirmed',
      timeout: CONFIRM_TIMEOUT_MS,
      interval: CONFIRM_POLL_MS
    })
    if (receipt.finality === 'dropped' || receipt.success === false) {
      throw new DemoPaymentError('The payment transaction failed on-chain.', { txHash: payment.hash })
    }
  }

  for (const [attempt, delay] of RETRY_DELAYS_MS.entries()) {
    const retry = await requestJson(fetchImpl, resourceUrl, {
      headers: { [PAYMENT_TX_HEADER]: payment.hash }
    })
    if (retry.status === 200) {
      return {
        payload: unlockedPayload(retry.body, resourceId, payment.hash),
        paidBaseUnits: requirements.amountBaseUnits,
        txHash: payment.hash
      }
    }
    const code = typeof retry.body?.error?.code === 'string' ? retry.body.error.code : 'unknown'
    const retryable = (retry.status === 402 && code === 'tx_not_found') ||
      (retry.status === 503 && code === 'payment_verification_unavailable')
    if (retryable && attempt < RETRY_DELAYS_MS.length - 1) {
      await wait(delay)
      continue
    }
    if (retry.status !== 402 && retry.status !== 503) {
      throw new DemoPaymentError(
        `The demo API returned unexpected HTTP ${retry.status} after payment.`,
        { txHash: payment.hash })
    }
    const message = typeof retry.body?.error?.message === 'string'
      ? retry.body.error.message
      : 'The payment was not accepted.'
    throw new DemoPaymentError(`The paid resource stayed locked: ${message}`,
      { code, txHash: payment.hash })
  }

  throw new DemoPaymentError('The paid resource stayed locked.',
    { txHash: payment.hash })
}
