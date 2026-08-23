const CANDIDE_HOST = 'api.candide.dev'
const SEPOLIA_CHAIN_ID = '11155111'
const PAYMASTER_ADDRESS = '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba'
const USDT_ADDRESS = '0xd077a400968890eacc75cdc901f0356c943e4fdb'
const TRANSFER_MAX_FEE = 100000n

function parseCandideEndpoint (value) {
  if (typeof value !== 'string') return null

  let endpoint
  try {
    endpoint = new URL(value)
  } catch {
    return null
  }
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== CANDIDE_HOST ||
    endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null

  const path = endpoint.pathname.replace(/\/$/, '')
  if (path !== `/public/v3/${SEPOLIA_CHAIN_ID}`) return null
  return `https://${CANDIDE_HOST}${path}`
}

export function inspectPaymasterTokenConfig (config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { ready: false }

  const bundler = parseCandideEndpoint(config.bundlerUrl)
  const paymaster = parseCandideEndpoint(config.paymasterUrl)
  const paymasterAddress = typeof config.paymasterAddress === 'string'
    ? config.paymasterAddress.toLowerCase()
    : null
  const tokenAddress = typeof config.paymasterToken?.address === 'string'
    ? config.paymasterToken.address.toLowerCase()
    : null
  let transferMaxFee
  try {
    transferMaxFee = BigInt(config.transferMaxFee)
  } catch {
    transferMaxFee = null
  }

  if (config.chainId !== Number(SEPOLIA_CHAIN_ID) || config.isSponsored === true ||
    config.useNativeCoins === true || bundler === null || bundler !== paymaster ||
    paymasterAddress !== PAYMASTER_ADDRESS || tokenAddress !== USDT_ADDRESS ||
    transferMaxFee !== TRANSFER_MAX_FEE) {
    return { ready: false }
  }

  return {
    ready: true,
    transferMaxFee
  }
}

export function paymasterTokenFee (preview) {
  if (typeof preview?.estimatedFee !== 'string' || !/^\d+$/.test(preview.estimatedFee)) return null
  const fee = BigInt(preview.estimatedFee)
  return fee > 0n ? fee : null
}
