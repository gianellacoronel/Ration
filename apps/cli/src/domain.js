import { randomUUID } from 'node:crypto'

import { TREASURY_NAME } from './config.js'

export function createWalletName (id = randomUUID()) {
  return `ration${id.replaceAll('-', '').slice(0, 4).toLowerCase()}`
}

export function isRationWalletName (name) {
  return /^ration[0-9a-f]{4}$/.test(name)
}

export function createUniqueWalletName (wallets, generator) {
  const existing = new Set(wallets.map((wallet) => wallet.name))
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = generator()
    if (isRationWalletName(name) && !existing.has(name)) return name
  }
  throw new Error('Could not generate a unique sandbox identifier.')
}

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

export function balanceBaseUnits (result) {
  if (typeof result?.balance === 'string' && /^\d+$/.test(result.balance)) {
    return BigInt(result.balance)
  }
  const match = result?.formatted?.match(/^(\d+(?:\.\d{1,6})?)\s+USDT$/)
  return match ? parseUsdt(match[1]) ?? 0n : 0n
}

export function formatBalance (result) {
  return formatUsdtBaseUnits(balanceBaseUnits(result))
}
