import { randomBytes } from 'node:crypto'

import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import { USDT_ADDRESS } from './config.js'
import { createSandboxMcpService } from './mcp.js'

const FUNDING_TIMEOUT_MS = 180000
const FUNDING_POLL_MS = 2000
const GAS_RESERVE_NUMERATOR = 125n
const GAS_RESERVE_DENOMINATOR = 100n

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function lifecycleGasReserve (tokenFee, nativeFee) {
  const fee = tokenFee * 2n + nativeFee
  return (fee * GAS_RESERVE_NUMERATOR + GAS_RESERVE_DENOMINATOR - 1n) /
    GAS_RESERVE_DENOMINATOR
}

async function confirmedTransaction (account, hash) {
  const receipt = await account.waitForTransaction(hash, {
    target: 'confirmed',
    timeout: FUNDING_TIMEOUT_MS
  })
  if (receipt.finality === 'dropped' || receipt.success === false) {
    throw new Error('The sandbox transaction was not confirmed successfully.')
  }
}

export async function createEphemeralSandbox (config, options = {}) {
  const WalletManager = options.WalletManager ?? WalletManagerEvm
  const seed = (options.randomBytes ?? randomBytes)(64)
  const Wdk = options.WDK ?? WDK
  let wdk
  let account
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true

    let disposalError
    try {
      account?.dispose()
    } catch (error) {
      disposalError = error
    }
    try {
      wdk?.dispose()
    } catch (error) {
      disposalError ??= error
    }

    seed.fill(0)
    account = undefined
    wdk = undefined
    if (disposalError) throw disposalError
  }

  try {
    wdk = new Wdk(seed).registerWallet('sepolia', WalletManager, config)
    account = await wdk.getAccount('sepolia', 0)
    const address = await account.getAddress()

    return {
      address,
      getUsdtBalance: () => account.getTokenBalance(USDT_ADDRESS),
      getEthBalance: () => account.getBalance(),
      openMcp: (mcpOptions) => createSandboxMcpService(
        seed,
        config,
        address,
        mcpOptions
      ),
      async quoteLifecycleGas (recipient) {
        const tokenQuote = await account.quoteTransfer({
          token: USDT_ADDRESS,
          recipient,
          amount: 0n
        })
        const nativeQuote = await account.quoteSendTransaction({ to: recipient, value: 0n })
        if (tokenQuote.fee <= 0n || nativeQuote.fee <= 0n) {
          throw new Error('WDK returned an invalid sandbox lifecycle gas quote.')
        }
        return {
          tokenFee: tokenQuote.fee,
          nativeFee: nativeQuote.fee
        }
      },
      async sweepUsdt (recipient) {
        const balance = await account.getTokenBalance(USDT_ADDRESS)
        if (balance === 0n) return { amount: 0n, fee: 0n, remaining: 0n }

        const quote = await account.quoteTransfer({
          token: USDT_ADDRESS,
          recipient,
          amount: balance
        })
        if (quote.fee <= 0n || await account.getBalance() < quote.fee) {
          return { amount: 0n, fee: quote.fee, remaining: balance }
        }
        const result = await account.transfer({
          token: USDT_ADDRESS,
          recipient,
          amount: balance
        })
        await confirmedTransaction(account, result.hash)
        return {
          amount: balance,
          fee: result.fee,
          hash: result.hash,
          remaining: await account.getTokenBalance(USDT_ADDRESS)
        }
      },
      async sweepEth (recipient) {
        let amount = 0n
        let fee = 0n
        let hash

        for (let round = 0; round < 5; round++) {
          const balance = await account.getBalance()
          const quote = await account.quoteSendTransaction({ to: recipient, value: 0n })
          if (quote.fee <= 0n) throw new Error('WDK returned an invalid native sweep fee.')
          if (balance <= quote.fee) return { amount, fee, hash, remaining: balance }

          const value = balance - quote.fee
          const exactQuote = await account.quoteSendTransaction({ to: recipient, value })
          if (exactQuote.fee <= 0n || balance <= exactQuote.fee) {
            return { amount, fee, hash, remaining: balance }
          }
          const exactValue = balance - exactQuote.fee
          const result = await account.sendTransaction({ to: recipient, value: exactValue })
          await confirmedTransaction(account, result.hash)
          amount += exactValue
          fee += result.fee
          hash = result.hash
        }

        const remaining = await account.getBalance()
        const finalQuote = await account.quoteSendTransaction({ to: recipient, value: 0n })
        if (remaining > finalQuote.fee) {
          throw new Error('The native sweep left an economical remainder.')
        }
        return { amount, fee, hash, remaining }
      },
      dispose
    }
  } catch (error) {
    try {
      dispose()
    } catch {}
    throw error
  }
}

async function waitForBalance (readBalance, expectedBalance, options = {}) {
  const timeoutMs = options.timeoutMs ?? FUNDING_TIMEOUT_MS
  const pollMs = options.pollMs ?? FUNDING_POLL_MS
  const wait = options.sleep ?? sleep
  const deadline = Date.now() + timeoutMs

  while (true) {
    if (options.signal?.aborted) {
      const error = new Error('Sandbox funding wait was interrupted.')
      error.signal = options.signal.reason
      throw error
    }
    const balance = await readBalance()
    if (balance >= expectedBalance) return balance
    if (Date.now() >= deadline) throw new Error('Sandbox funding was not confirmed before the session timeout.')
    await wait(pollMs)
  }
}

export function waitForSandboxFunding (sandbox, expectedBalance, options = {}) {
  return waitForBalance(() => sandbox.getUsdtBalance(), expectedBalance, options)
}

export function waitForSandboxGas (sandbox, expectedBalance, options = {}) {
  return waitForBalance(() => sandbox.getEthBalance(), expectedBalance, options)
}
