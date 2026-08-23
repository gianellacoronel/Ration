import { TREASURY_NAME } from './config.js'

export function isTreasuryConfigured (wallets) {
  return wallets.some((wallet) => wallet.name === TREASURY_NAME)
}

export function parseUsdt (value) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return null
  const [integer, fraction = ''] = value.split('.')
  const amount = BigInt(integer) * 1000000n + BigInt(fraction.padEnd(6, '0'))
  return amount > 0n ? amount : null
}

export function formatUsdtBaseUnits (value) {
  const amount = BigInt(value)
  const integer = amount / 1000000n
  const fraction = (amount % 1000000n).toString().padStart(6, '0')
  const visibleFraction = fraction.slice(0, 2) + fraction.slice(2).replace(/0+$/, '')
  return `${integer}.${visibleFraction} USDT`
}

export function formatEthBaseUnits (value) {
  const amount = BigInt(value)
  const integer = amount / 1000000000000000000n
  const fraction = (amount % 1000000000000000000n).toString().padStart(18, '0')
  const visibleFraction = fraction.replace(/0+$/, '') || '0'
  return `${integer}.${visibleFraction} ETH`
}

export function balanceBaseUnits (result) {
  if (typeof result?.balance === 'string' && /^\d+$/.test(result.balance)) {
    return BigInt(result.balance)
  }
  const match = result?.formatted?.match(/^(\d+(?:\.\d{1,6})?)\s+USDT$/)
  return match ? parseUsdt(match[1]) ?? 0n : 0n
}

export function nativeBalanceBaseUnits (result) {
  return typeof result?.balance === 'string' && /^\d+$/.test(result.balance)
    ? BigInt(result.balance)
    : 0n
}

export function feeBaseUnits (preview) {
  if (typeof preview?.estimatedFee !== 'string' || !/^\d+$/.test(preview.estimatedFee)) return null
  const fee = BigInt(preview.estimatedFee)
  return fee > 0n ? fee : null
}
