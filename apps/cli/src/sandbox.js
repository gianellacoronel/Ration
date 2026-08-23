import { randomBytes } from 'node:crypto'

import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import { USDT_ADDRESS } from './config.js'
import { createSandboxMcpService } from './mcp.js'
import { createSandboxHierarchy } from './sandbox-hierarchy.js'

const FUNDING_TIMEOUT_MS = 180000
const CHAIN_POLL_MS = 1000
const FUNDING_POLL_MS = CHAIN_POLL_MS
const GAS_RESERVE_NUMERATOR = 125n
const GAS_RESERVE_DENOMINATOR = 100n

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function lifecycleGasReserve (tokenFee, nativeFee, paymentCount = 1, nativeTransferCount = 1) {
  const fee = tokenFee * (BigInt(paymentCount) + 1n) +
    nativeFee * BigInt(nativeTransferCount)
  return (fee * GAS_RESERVE_NUMERATOR + GAS_RESERVE_DENOMINATOR - 1n) /
    GAS_RESERVE_DENOMINATOR
}

async function confirmedTransaction (account, hash) {
  const receipt = await account.waitForTransaction(hash, {
    target: 'confirmed',
    timeout: FUNDING_TIMEOUT_MS,
    interval: CHAIN_POLL_MS
  })
  if (receipt.finality === 'dropped' || receipt.success === false) {
    const error = new Error('The sandbox transaction was not confirmed successfully.')
    error.transactionSettled = true
    throw error
  }
  return receipt
}

export async function createEphemeralSandbox (config, options = {}) {
  const WalletManager = options.WalletManager ?? WalletManagerEvm
  const seed = options.seed ?? (options.randomBytes ?? randomBytes)(64)
  if (!(seed instanceof Uint8Array) || seed.byteLength !== 64) {
    throw new Error('The sandbox seed must contain exactly 64 mutable bytes.')
  }
  const Wdk = options.WDK ?? WDK
  let wdk
  let account
  let hierarchy
  let disposed = false
  let financialOperation = Promise.resolve()

  const runFinancial = (operation) => {
    const result = financialOperation.then(operation, operation)
    financialOperation = result.catch(() => {})
    return result
  }

  const dispose = () => {
    if (disposed) return
    disposed = true

    let disposalError
    try {
      hierarchy?.dispose()
    } catch (error) {
      disposalError = error
    }
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
    hierarchy = createSandboxHierarchy({
      rootSeed: seed,
      rootAccount: account,
      rootAddress: address,
      config,
      WDK: Wdk,
      WalletManager,
      confirmedTransaction,
      runFinancial,
      now: () => new Date().toISOString()
    })

    return {
      address,
      getUsdtBalance: () => account.getTokenBalance(USDT_ADDRESS),
      getEthBalance: () => account.getBalance(),
      waitForTransaction: (hash) => confirmedTransaction(account, hash),
      openMcp: (mcpOptions = {}) => createSandboxMcpService(
        seed,
        config,
        address,
        { ...mcpOptions, hierarchy, runFinancial }
      ),
      delegateBudget: (input, hooks) => hierarchy.delegate(input, hooks),
      closeChild: (name, hooks) => hierarchy.close(name, hooks),
      closeChildren: (hooks) => hierarchy.closeAll(hooks),
      restoreHierarchy: (tree) => hierarchy.restore(tree),
      getSandboxTree: () => hierarchy.snapshot(),
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
      async sweepUsdt (recipient, hooks = {}) {
        const balance = await account.getTokenBalance(USDT_ADDRESS)
        if (balance === 0n) return { amount: 0n, fee: 0n, remaining: 0n, transactions: [] }

        const quote = await account.quoteTransfer({
          token: USDT_ADDRESS,
          recipient,
          amount: balance
        })
        if (quote.fee <= 0n || await account.getBalance() < quote.fee) {
          return { amount: 0n, fee: quote.fee, remaining: balance, transactions: [] }
        }
        const transaction = {
          hash: null,
          amount: balance,
          fee: quote.fee,
          status: 'submission_unknown'
        }
        let result
        try {
          await hooks.onTransactions?.([transaction])
          result = await account.transfer({
            token: USDT_ADDRESS,
            recipient,
            amount: balance
          })
          Object.assign(transaction, {
            hash: result.hash,
            fee: result.fee,
            status: 'confirmation_unknown'
          })
          await hooks.onTransactions?.([transaction])
          await confirmedTransaction(account, result.hash)
          transaction.status = 'confirmed'
          await hooks.onTransactions?.([transaction])
        } catch (error) {
          const failure = error instanceof Error ? error : new Error('The token sweep failed.')
          failure.partialSweep = {
            amount: 0n,
            fee: 0n,
            hash: transaction.hash,
            transactions: [transaction],
            remaining: balance
          }
          throw failure
        }
        let remaining = null
        try {
          remaining = await account.getTokenBalance(USDT_ADDRESS)
        } catch {}
        return {
          amount: balance,
          fee: result.fee,
          hash: result.hash,
          transactions: [transaction],
          remaining
        }
      },
      async sweepEth (recipient, hooks = {}) {
        let amount = 0n
        let fee = 0n
        let hash
        const transactions = []

        try {
          for (let round = 0; round < 5; round++) {
            const balance = await account.getBalance()
            const quote = await account.quoteSendTransaction({ to: recipient, value: 0n })
            if (quote.fee <= 0n) throw new Error('WDK returned an invalid native sweep fee.')
            if (balance <= quote.fee) return { amount, fee, hash, transactions, remaining: balance }

            const value = balance - quote.fee
            const exactQuote = await account.quoteSendTransaction({ to: recipient, value })
            if (exactQuote.fee <= 0n || balance <= exactQuote.fee) {
              return { amount, fee, hash, transactions, remaining: balance }
            }
            const exactValue = balance - exactQuote.fee
            const transaction = {
              hash: null,
              amount: exactValue,
              fee: exactQuote.fee,
              status: 'submission_unknown'
            }
            transactions.push(transaction)
            await hooks.onTransactions?.(transactions)
            const result = await account.sendTransaction({ to: recipient, value: exactValue })
            Object.assign(transaction, {
              hash: result.hash,
              fee: result.fee,
              status: 'confirmation_unknown'
            })
            await hooks.onTransactions?.(transactions)
            await confirmedTransaction(account, result.hash)
            transaction.status = 'confirmed'
            await hooks.onTransactions?.(transactions)
            amount += exactValue
            fee += result.fee
            hash = result.hash
          }

          const remaining = await account.getBalance()
          const finalQuote = await account.quoteSendTransaction({ to: recipient, value: 0n })
          if (remaining > finalQuote.fee) {
            throw new Error('The native sweep left an economical remainder.')
          }
          return { amount, fee, hash, transactions, remaining }
        } catch (error) {
          const failure = error instanceof Error ? error : new Error('The native sweep failed.')
          failure.partialSweep = { amount, fee, hash, transactions, remaining: null }
          throw failure
        }
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
