import { hkdfSync } from 'node:crypto'

import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import { USDT_ADDRESS } from './config.js'

const CHAIN = 'sepolia'
const ROOT_ID = 'root'
const MAX_CHILDREN = 1
export const MAX_CHILD_FINANCIAL_WRITES = 5
const CHILD_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const GAS_RESERVE_NUMERATOR = 125n
const GAS_RESERVE_DENOMINATOR = 100n

function childSeed (rootSeed, id) {
  return Buffer.from(hkdfSync(
    'sha256',
    rootSeed,
    Buffer.alloc(0),
    `ration/child-wallet/v1/${id}`,
    64
  ))
}

function disposeWallet (wallet) {
  if (wallet.disposed) return
  wallet.disposed = true
  let disposalError
  try { wallet.account?.dispose() } catch (error) { disposalError = error }
  try { wallet.wdk?.dispose() } catch (error) { disposalError ??= error }
  wallet.seed?.fill(0)
  wallet.account = undefined
  wallet.wdk = undefined
  wallet.seed = undefined
  if (disposalError) throw disposalError
}

function transactionRecord (asset, amount, recipient, fee) {
  return {
    asset,
    amountBaseUnits: amount.toString(),
    recipientAddress: recipient,
    transactionHash: null,
    feeWei: fee.toString(),
    status: 'submission_unknown'
  }
}

function publicNode (node) {
  return structuredClone(node.record)
}

export function createSandboxHierarchy (input) {
  const Wdk = input.WDK ?? WDK
  const WalletManager = input.WalletManager ?? WalletManagerEvm
  const children = new Map()
  let sequence = 0
  let disposed = false
  let mutation = Promise.resolve()

  const snapshot = () => ({
    rootId: ROOT_ID,
    nodes: [{
      id: ROOT_ID,
      name: ROOT_ID,
      parentId: null,
      address: input.rootAddress,
      status: disposed ? 'disposed' : 'open',
      disposalStatus: disposed ? 'disposed' : 'active'
    }, ...[...children.values()].map(publicNode)]
  })

  const notify = async (hooks) => hooks?.onChange?.(snapshot())
  const serialize = (operation) => {
    const execute = () => input.runFinancial ? input.runFinancial(operation) : operation()
    const result = mutation.then(execute, execute)
    mutation = result.catch(() => {})
    return result
  }

  const createWallet = async (id) => {
    const seed = childSeed(input.rootSeed, id)
    let wdk
    let account
    try {
      wdk = new Wdk(seed).registerWallet(CHAIN, WalletManager, input.config)
      account = await wdk.getAccount(CHAIN, 0)
      return { seed, wdk, account, disposed: false }
    } catch (error) {
      try { account?.dispose() } catch {}
      try { wdk?.dispose() } catch {}
      seed.fill(0)
      throw error
    }
  }

  const settleFunding = async (node, hooks) => {
    const account = node.wallet.account
    const funding = node.record.transactions.funding
    for (const transaction of [funding.eth, funding.usdt]) {
      if (!transaction || transaction.status === 'confirmed') continue
      if (transaction.transactionHash) {
        await input.confirmedTransaction(account, transaction.transactionHash)
        transaction.status = 'confirmed'
        await notify(hooks)
      }
    }

    const usdtBalance = await account.getTokenBalance(USDT_ADDRESS)
    const ethBalance = await account.getBalance()
    if (funding.usdt?.status === 'submission_unknown' && usdtBalance === 0n) {
      throw new Error(`Funding for child sandbox "${node.record.name}" is still unresolved.`)
    }
    if (funding.eth?.status === 'submission_unknown' && ethBalance === 0n) {
      throw new Error(`Gas funding for child sandbox "${node.record.name}" is still unresolved.`)
    }
  }

  const settleReturns = async (node, hooks) => {
    const account = node.wallet.account
    const returns = node.record.transactions.returns
    let usdtReturned = 0n
    let ethReturned = 0n

    const settle = async (transaction) => {
      if (!transaction || ['confirmed', 'not_needed', 'failed_on_chain'].includes(transaction.status)) return
      if (!transaction.transactionHash) return
      try {
        await input.confirmedTransaction(account, transaction.transactionHash)
        transaction.status = 'confirmed'
        await notify(hooks)
      } catch (error) {
        if (!error?.transactionSettled) throw error
        transaction.status = 'failed_on_chain'
        await notify(hooks)
      }
    }

    await settle(returns.usdt)
    if (returns.usdt?.status === 'confirmed') {
      usdtReturned = BigInt(returns.usdt.amountBaseUnits)
    } else if (returns.usdt?.status === 'submission_unknown' &&
      !returns.usdt.transactionHash && await account.getTokenBalance(USDT_ADDRESS) > 0n) {
      throw new Error(`A previous USDT return from child sandbox "${node.record.name}" is unresolved.`)
    }

    for (const transaction of returns.eth) {
      await settle(transaction)
      if (transaction.status === 'confirmed') ethReturned += BigInt(transaction.amountBaseUnits)
    }
    if (returns.eth.some((transaction) =>
      transaction.status === 'submission_unknown' && !transaction.transactionHash)) {
      const balance = await account.getBalance()
      const quote = await account.quoteSendTransaction({ to: input.rootAddress, value: 0n })
      if (balance > quote.fee) {
        throw new Error(`A previous ETH return from child sandbox "${node.record.name}" is unresolved.`)
      }
    }
    return { usdtReturned, ethReturned }
  }

  const closeNode = async (node, hooks = {}) => {
    if (node.record.status === 'closed') return publicNode(node)
    if (!node.wallet || node.wallet.disposed) {
      throw new Error(`Child sandbox "${node.record.name}" has no active wallet.`)
    }

    await settleFunding(node, hooks)
    const settledReturns = await settleReturns(node, hooks)
    node.record.status = 'closing'
    await notify(hooks)
    const account = node.wallet.account
    const parentAddress = input.rootAddress

    let usdtReturned = settledReturns.usdtReturned
    let usdtBalance = await account.getTokenBalance(USDT_ADDRESS)
    if (usdtBalance > 0n) {
      const quote = await account.quoteTransfer({
        token: USDT_ADDRESS,
        recipient: parentAddress,
        amount: usdtBalance
      })
      if (quote.fee <= 0n || await account.getBalance() < quote.fee) {
        throw new Error(`Child sandbox "${node.record.name}" lacks gas to return its USDT.`)
      }
      const transaction = transactionRecord('USDT', usdtBalance, parentAddress, quote.fee)
      node.record.transactions.returns.usdt = transaction
      await notify(hooks)
      const result = await account.transfer({
        token: USDT_ADDRESS,
        recipient: parentAddress,
        amount: usdtBalance
      })
      transaction.transactionHash = result.hash
      transaction.feeWei = result.fee.toString()
      transaction.status = 'confirmation_unknown'
      await notify(hooks)
      await input.confirmedTransaction(account, result.hash)
      transaction.status = 'confirmed'
      usdtReturned += usdtBalance
      await notify(hooks)
      usdtBalance = await account.getTokenBalance(USDT_ADDRESS)
      if (usdtBalance > 0n) {
        throw new Error(`Child sandbox "${node.record.name}" left an unrecovered USDT balance.`)
      }
    } else if (!node.record.transactions.returns.usdt) {
      node.record.transactions.returns.usdt = {
        asset: 'USDT',
        amountBaseUnits: '0',
        recipientAddress: parentAddress,
        transactionHash: null,
        feeWei: '0',
        status: 'not_needed'
      }
      await notify(hooks)
    }

    let ethReturned = settledReturns.ethReturned
    for (let round = 0; round < 5; round++) {
      const balance = await account.getBalance()
      const quote = await account.quoteSendTransaction({ to: parentAddress, value: 0n })
      if (quote.fee <= 0n) throw new Error('WDK returned an invalid child ETH sweep quote.')
      if (balance <= quote.fee) break
      const exactQuote = await account.quoteSendTransaction({
        to: parentAddress,
        value: balance - quote.fee
      })
      if (exactQuote.fee <= 0n || balance <= exactQuote.fee) break
      const value = balance - exactQuote.fee
      const transaction = transactionRecord('ETH', value, parentAddress, exactQuote.fee)
      node.record.transactions.returns.eth.push(transaction)
      await notify(hooks)
      const result = await account.sendTransaction({ to: parentAddress, value })
      transaction.transactionHash = result.hash
      transaction.feeWei = result.fee.toString()
      transaction.status = 'confirmation_unknown'
      await notify(hooks)
      await input.confirmedTransaction(account, result.hash)
      transaction.status = 'confirmed'
      ethReturned += value
      await notify(hooks)
    }

    const finalEth = await account.getBalance()
    const finalEthQuote = await account.quoteSendTransaction({ to: parentAddress, value: 0n })
    if (finalEth > finalEthQuote.fee) {
      throw new Error(`Child sandbox "${node.record.name}" left economically recoverable ETH.`)
    }

    node.record.finalUsdtBalanceBaseUnits = usdtBalance.toString()
    node.record.finalEthBalanceWei = finalEth.toString()
    node.record.usdtReturnedToParentBaseUnits = usdtReturned.toString()
    node.record.ethReturnedToParentWei = ethReturned.toString()
    disposeWallet(node.wallet)
    node.record.disposalStatus = 'disposed'
    node.record.status = 'closed'
    node.record.closedAt = input.now()
    await notify(hooks)
    return publicNode(node)
  }

  const delegate = async ({ name, amount }, hooks = {}) => serialize(async () => {
    if (disposed) throw new Error('The parent sandbox has been disposed.')
    if (!CHILD_NAME_PATTERN.test(name)) {
      throw new Error('Child names must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.')
    }
    if (typeof amount !== 'bigint' || amount <= 0n) throw new Error('The delegated USDT amount must be positive.')
    if (sequence >= MAX_CHILDREN) throw new Error('This experiment allows one child sandbox per session.')
    if ([...children.values()].some((child) => child.record.name === name)) {
      throw new Error(`A child sandbox named "${name}" already exists.`)
    }

    const parentBalance = await input.rootAccount.getTokenBalance(USDT_ADDRESS)
    if (amount > parentBalance) {
      throw new Error(`Insufficient parent USDT balance: requested ${amount}, available ${parentBalance} base units.`)
    }

    const id = `${ROOT_ID}/${++sequence}`
    const wallet = await createWallet(id)
    const address = await wallet.account.getAddress()
    const node = {
      wallet,
      record: {
        id,
        name,
        parentId: ROOT_ID,
        address,
        delegatedBudgetBaseUnits: amount.toString(),
        gasReserveWei: null,
        status: 'provisioning',
        disposalStatus: 'active',
        createdAt: input.now(),
        closedAt: null,
        agentStatus: 'not_started',
        agentExitCode: null,
        agentSignal: null,
        agentStartedAt: null,
        agentFinishedAt: null,
        transactions: {
          funding: { eth: null, usdt: null },
          returns: { usdt: null, eth: [] }
        },
        usdtReturnedToParentBaseUnits: '0',
        ethReturnedToParentWei: '0',
        finalUsdtBalanceBaseUnits: null,
        finalEthBalanceWei: null
      }
    }
    children.set(id, node)
    await notify(hooks)

    try {
      const childTokenQuote = await wallet.account.quoteTransfer({
        token: USDT_ADDRESS,
        recipient: input.rootAddress,
        amount: 0n
      })
      const childNativeQuote = await wallet.account.quoteSendTransaction({
        to: input.rootAddress,
        value: 0n
      })
      if (childTokenQuote.fee <= 0n || childNativeQuote.fee <= 0n) {
        throw new Error('WDK returned an invalid child lifecycle gas quote.')
      }
      const parentTokenQuote = await input.rootAccount.quoteTransfer({
        token: USDT_ADDRESS,
        recipient: address,
        amount
      })
      const tokenFee = parentTokenQuote.fee > childTokenQuote.fee
        ? parentTokenQuote.fee
        : childTokenQuote.fee
      const lifecycleFees = tokenFee * BigInt(MAX_CHILD_FINANCIAL_WRITES + 1) +
        childNativeQuote.fee
      const gasReserve = (lifecycleFees * GAS_RESERVE_NUMERATOR + GAS_RESERVE_DENOMINATOR - 1n) /
        GAS_RESERVE_DENOMINATOR
      node.record.gasReserveWei = gasReserve.toString()

      const parentNativeQuote = await input.rootAccount.quoteSendTransaction({
        to: address,
        value: gasReserve
      })
      if (parentTokenQuote.fee <= 0n || parentNativeQuote.fee <= 0n) {
        throw new Error('WDK returned an invalid child provisioning gas quote.')
      }
      const requiredParentEth = gasReserve + parentTokenQuote.fee + parentNativeQuote.fee
      if (await input.rootAccount.getBalance() < requiredParentEth) {
        throw new Error(`Insufficient parent Sepolia ETH for child lifecycle: required ${requiredParentEth} wei.`)
      }

      const ethFunding = transactionRecord('ETH', gasReserve, address, parentNativeQuote.fee)
      node.record.transactions.funding.eth = ethFunding
      await notify(hooks)
      const ethResult = await input.rootAccount.sendTransaction({ to: address, value: gasReserve })
      ethFunding.transactionHash = ethResult.hash
      ethFunding.feeWei = ethResult.fee.toString()
      ethFunding.status = 'confirmation_unknown'
      await notify(hooks)
      await input.confirmedTransaction(input.rootAccount, ethResult.hash)
      ethFunding.status = 'confirmed'
      await notify(hooks)

      const usdtFunding = transactionRecord('USDT', amount, address, parentTokenQuote.fee)
      node.record.transactions.funding.usdt = usdtFunding
      await notify(hooks)
      const usdtResult = await input.rootAccount.transfer({
        token: USDT_ADDRESS,
        recipient: address,
        amount
      })
      usdtFunding.transactionHash = usdtResult.hash
      usdtFunding.feeWei = usdtResult.fee.toString()
      usdtFunding.status = 'confirmation_unknown'
      await notify(hooks)
      await input.confirmedTransaction(input.rootAccount, usdtResult.hash)
      usdtFunding.status = 'confirmed'
      node.record.status = 'open'
      await notify(hooks)

      const fundedBalance = await wallet.account.getTokenBalance(USDT_ADDRESS)
      if (fundedBalance !== amount) {
        throw new Error(`Child sandbox "${name}" did not receive exactly the delegated USDT amount.`)
      }
      return publicNode(node)
    } catch (error) {
      node.record.status = 'funding_failed'
      try { await notify(hooks) } catch {}
      throw error
    }
  })

  const close = (name, hooks = {}) => serialize(async () => {
    const node = [...children.values()].find((child) => child.record.name === name)
    if (!node) throw new Error(`Child sandbox "${name}" does not exist.`)
    return closeNode(node, hooks)
  })

  const closeAll = (hooks = {}) => serialize(async () => {
    const closed = []
    for (const node of children.values()) {
      if (node.record.status !== 'closed') closed.push(await closeNode(node, hooks))
    }
    return closed
  })

  const updateAgent = (name, update, hooks = {}) => serialize(async () => {
    const node = [...children.values()].find((child) => child.record.name === name)
    if (!node) throw new Error(`Child sandbox "${name}" does not exist.`)
    Object.assign(node.record, update)
    await notify(hooks)
    return publicNode(node)
  })

  const openChildMcp = async (name, createService, options = {}) => {
    const node = [...children.values()].find((child) => child.record.name === name)
    if (!node || node.record.status !== 'open' || !node.wallet || node.wallet.disposed) {
      throw new Error(`Child sandbox "${name}" is not open.`)
    }
    return createService(node.wallet.seed, input.config, node.record.address, {
      ...options,
      runFinancial: input.runFinancial,
      sandboxIdentity: {
        id: node.record.id,
        name: node.record.name,
        address: node.record.address,
        parentId: ROOT_ID
      },
      maxFinancialWrites: MAX_CHILD_FINANCIAL_WRITES
    })
  }

  const restore = async (tree) => {
    if (!tree?.nodes) return
    for (const record of tree.nodes.filter((entry) => entry.id !== ROOT_ID)) {
      const match = /^root\/(\d+)$/.exec(record.id)
      if (!match || record.parentId !== ROOT_ID || !CHILD_NAME_PATTERN.test(record.name)) {
        throw new Error('The authenticated child sandbox tree is invalid.')
      }
      sequence = Math.max(sequence, Number(match[1]))
      if (children.has(record.id)) continue
      if (record.status === 'closed' && record.disposalStatus === 'disposed') {
        children.set(record.id, { wallet: null, record: structuredClone(record) })
        continue
      }
      const wallet = await createWallet(record.id)
      const address = await wallet.account.getAddress()
      if (address.toLowerCase() !== record.address.toLowerCase()) {
        disposeWallet(wallet)
        throw new Error('A recovered child sandbox address does not match its authenticated journal.')
      }
      children.set(record.id, { wallet, record: structuredClone(record) })
    }
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    let disposalError
    for (const node of children.values()) {
      if (!node.wallet) continue
      try { disposeWallet(node.wallet) } catch (error) { disposalError ??= error }
      node.record.disposalStatus = 'disposed'
    }
    if (disposalError) throw disposalError
  }

  return { snapshot, delegate, close, closeAll, updateAgent, openChildMcp, restore, dispose }
}
