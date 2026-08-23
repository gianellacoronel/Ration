const SEPOLIA_CHAIN_ID = 11155111
const ACCOUNT_ABSTRACTION_FIELDS = [
  'bundlerUrl',
  'entryPointAddress',
  'entrypointAddress',
  'paymasterUrl',
  'paymasterAddress',
  'paymasterToken',
  'safeModulesVersion',
  'isSponsored',
  'useNativeCoins'
]

function validProvider (provider) {
  if (typeof provider === 'string') return provider.length > 0
  return Array.isArray(provider) && provider.length > 0 &&
    provider.every((entry) => typeof entry === 'string' && entry.length > 0)
}

export function inspectStandardSepoliaConfig (config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
    config.chainId !== SEPOLIA_CHAIN_ID || !validProvider(config.provider) ||
    ACCOUNT_ABSTRACTION_FIELDS.some((field) => field in config)) return { ready: false }

  let transferMaxFee
  try {
    transferMaxFee = BigInt(config.transferMaxFee)
  } catch {
    return { ready: false }
  }
  if (transferMaxFee <= 0n) return { ready: false }

  return {
    ready: true,
    walletConfig: {
      chainId: SEPOLIA_CHAIN_ID,
      provider: config.provider,
      transferMaxFee,
      transactionMaxFee: transferMaxFee
    }
  }
}
