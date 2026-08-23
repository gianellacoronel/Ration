import { randomBytes } from 'node:crypto'

import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'

const FUNDING_TIMEOUT_MS = 180000
const FUNDING_POLL_MS = 2000

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function createEphemeralSandbox (config, options = {}) {
  const WalletManager = options.WalletManager ?? WalletManagerEvmErc4337
  const seed = (options.randomBytes ?? randomBytes)(64)
  let wallet
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
      wallet?.dispose()
    } catch (error) {
      disposalError ??= error
    }

    seed.fill(0)
    account = undefined
    wallet = undefined
    if (disposalError) throw disposalError
  }

  try {
    wallet = new WalletManager(seed, config)
    account = await wallet.getAccount(0)
    const address = await account.getAddress()
    const token = config.paymasterToken.address

    return {
      address,
      getBalance: () => account.getTokenBalance(token),
      async sweep (recipient) {
        const balance = await account.getTokenBalance(token)
        if (balance <= 1n) return { amount: 0n, fee: 0n }

        const probe = await account.quoteTransfer({ token, recipient, amount: 1n })
        if (probe.fee <= 0n || probe.fee >= balance) {
          return { amount: 0n, fee: probe.fee }
        }

        let amount = balance - probe.fee
        const quote = await account.quoteTransfer({ token, recipient, amount })
        if (quote.fee <= 0n || quote.fee >= balance) {
          return { amount: 0n, fee: quote.fee }
        }
        if (quote.fee !== probe.fee) {
          amount = balance - quote.fee
          await account.quoteTransfer({ token, recipient, amount })
        }

        const result = await account.transfer({ token, recipient, amount })
        const receipt = await account.waitForTransaction(result.hash, {
          target: 'confirmed',
          timeout: FUNDING_TIMEOUT_MS
        })
        if (receipt.finality === 'dropped' || receipt.success === false) {
          throw new Error('The sandbox sweep was not confirmed successfully.')
        }
        return { ...result, amount }
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

export async function waitForSandboxFunding (sandbox, expectedBalance, options = {}) {
  const timeoutMs = options.timeoutMs ?? FUNDING_TIMEOUT_MS
  const pollMs = options.pollMs ?? FUNDING_POLL_MS
  const wait = options.sleep ?? sleep
  const deadline = Date.now() + timeoutMs

  while (true) {
    const balance = await sandbox.getBalance()
    if (balance >= expectedBalance) return balance
    if (Date.now() >= deadline) throw new Error('Sandbox funding was not confirmed before the session timeout.')
    await wait(pollMs)
  }
}
