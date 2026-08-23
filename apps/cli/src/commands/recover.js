import { formatEthBaseUnits, formatUsdtBaseUnits } from '../domain.js'
import {
  acquireSessionLease,
  listIncompleteSessionJournals,
  persistSessionJournal,
  prepareRecoverySession,
  readSessionJournal,
  transitionSessionJournal,
  verifySessionJournal
} from '../recovery.js'
import { createEphemeralSandbox } from '../sandbox.js'
import {
  createSessionReceipt,
  finalizeSessionReceipt,
  persistSessionReceipt,
  shortSessionId
} from '../session.js'
import { requireStandardSepolia } from './shared.js'

async function recoverOne (storedJournal, standard, options, output) {
  const prepare = options.prepareRecoverySession ?? prepareRecoverySession
  const persistJournal = options.persistSessionJournal ?? persistSessionJournal
  const persistReceipt = options.persistSessionReceipt ?? persistSessionReceipt
  const createSandbox = options.createEphemeralSandbox ?? createEphemeralSandbox
  const recovery = await prepare(storedJournal.sessionId, options)
  let sandbox
  let releaseSessionLease
  try {
    const journal = verifySessionJournal(storedJournal, recovery.journalKey)
    if (['complete', 'recovered'].includes(journal.lifecycle.state)) {
      output.log(`Session ${shortSessionId(journal.sessionId)} is already complete; no funds were moved.`)
      return true
    }
    releaseSessionLease = await (options.acquireSessionLease ?? acquireSessionLease)(journal.sessionId, options)
    sandbox = await createSandbox(standard.walletConfig, { seed: recovery.seed })
    if (sandbox.address.toLowerCase() !== journal.sandboxAddress.toLowerCase()) {
      throw new Error('The recovered sandbox address does not match its authenticated journal.')
    }

    transitionSessionJournal(journal, 'sweeping', {}, options)
    await persistJournal(journal, recovery.journalKey, options)

    const unsettledFunding = new Set()
    for (const [asset, funding] of Object.entries(journal.transactions.funding)) {
      if (!funding || /confirmed/.test(funding.status ?? '')) continue
      if (!funding.transactionHash) {
        unsettledFunding.add(asset)
        continue
      }
      try {
        await sandbox.waitForTransaction?.(funding.transactionHash)
      } catch (error) {
        if (error?.transactionSettled) {
          funding.status = 'failed_on_chain'
          await persistJournal(journal, recovery.journalKey, options)
        } else {
          unsettledFunding.add(asset)
        }
      }
    }

    const unsettledReturns = new Set()
    const previousUsdtReturn = journal.transactions.returns.usdt
    if (previousUsdtReturn && !['confirmed', 'not_needed'].includes(previousUsdtReturn.status)) {
      if (!previousUsdtReturn.transactionHash) {
        unsettledReturns.add('usdt')
      } else {
        try {
          await sandbox.waitForTransaction?.(previousUsdtReturn.transactionHash)
          previousUsdtReturn.status = 'confirmed'
          previousUsdtReturn.amountBaseUnits = previousUsdtReturn.attemptedAmountBaseUnits ?? previousUsdtReturn.amountBaseUnits
          await persistJournal(journal, recovery.journalKey, options)
        } catch (error) {
          if (!error?.transactionSettled) unsettledReturns.add('usdt')
        }
      }
    }
    for (const transaction of journal.transactions.returns.eth) {
      if (['confirmed', 'not_needed'].includes(transaction.status)) continue
      if (!transaction.transactionHash) {
        unsettledReturns.add('eth')
        continue
      }
      try {
        await sandbox.waitForTransaction?.(transaction.transactionHash)
        transaction.status = 'confirmed'
        await persistJournal(journal, recovery.journalKey, options)
      } catch (error) {
        if (!error?.transactionSettled) unsettledReturns.add('eth')
      }
    }

    const usdtBalance = await sandbox.getUsdtBalance()
    const ethBalance = await sandbox.getEthBalance()
    output.log(`Recovering ${shortSessionId(journal.sessionId)}`)
    output.log(`  Sandbox   ${journal.sandboxAddress}`)
    output.log(`  USDT      ${formatUsdtBaseUnits(usdtBalance)}`)
    output.log(`  Gas       ${formatEthBaseUnits(ethBalance)}`)

    if ((unsettledFunding.has('usdt') && usdtBalance === 0n) ||
      (unsettledFunding.has('eth') && ethBalance === 0n)) {
      throw new Error('A funding submission is still unresolved. Retry recovery after Sepolia settles.')
    }
    if ((unsettledReturns.has('usdt') && usdtBalance > 0n) ||
      (unsettledReturns.has('eth') && ethBalance > 0n)) {
      throw new Error('A previous return submission is still unresolved. Retry recovery before submitting another sweep.')
    }

    let usdtSweep = { amount: 0n, fee: 0n, remaining: usdtBalance, transactions: [] }
    if (usdtBalance > 0n) {
      usdtSweep = await sandbox.sweepUsdt(journal.treasuryAddress, {
        onTransactions: async ([transaction]) => {
          journal.transactions.returns.usdt = {
            amountBaseUnits: transaction.status === 'confirmed' ? transaction.amount.toString() : '0',
            attemptedAmountBaseUnits: transaction.amount.toString(),
            recipientAddress: journal.treasuryAddress,
            transactionHash: transaction.hash,
            feeWei: transaction.fee.toString(),
            remainingBaseUnits: null,
            status: transaction.status
          }
          await persistJournal(journal, recovery.journalKey, options)
        }
      })
      if ((usdtSweep.remaining ?? 0n) > 0n || usdtSweep.amount === 0n) {
        throw new Error('The recovered USDT balance could not be returned to the treasury.')
      }
    }
    journal.transactions.returns.usdt = {
      amountBaseUnits: usdtSweep.amount.toString(),
      recipientAddress: journal.treasuryAddress,
      transactionHash: usdtSweep.hash ?? usdtSweep.transactions?.[0]?.hash ?? null,
      feeWei: usdtSweep.fee?.toString() ?? '0',
      remainingBaseUnits: usdtSweep.remaining?.toString() ?? null,
      status: usdtSweep.amount > 0n ? 'confirmed' : 'not_needed'
    }
    await persistJournal(journal, recovery.journalKey, options)

    const ethSweep = await sandbox.sweepEth(journal.treasuryAddress, {
      onTransactions: async (transactions) => {
        journal.transactions.returns.eth = transactions.map((transaction) => ({
          amountWei: transaction.amount.toString(),
          recipientAddress: journal.treasuryAddress,
          transactionHash: transaction.hash,
          feeWei: transaction.fee.toString(),
          status: transaction.status
        }))
        await persistJournal(journal, recovery.journalKey, options)
      }
    })
    journal.transactions.returns.eth = (ethSweep.transactions ?? []).map((transaction) => ({
      amountWei: transaction.amount.toString(),
      recipientAddress: journal.treasuryAddress,
      transactionHash: transaction.hash,
      feeWei: transaction.fee.toString(),
      status: transaction.status ?? 'confirmed'
    }))
    await persistJournal(journal, recovery.journalKey, options)

    sandbox.dispose()
    sandbox = undefined

    const session = createSessionReceipt({
      budgetBaseUnits: BigInt(journal.budgetBaseUnits),
      command: journal.childCommand?.executable ?? 'unknown',
      commandArgs: Array(journal.childCommand?.argumentCount ?? 0).fill('')
    }, { ...options, randomUUID: () => journal.sessionId })
    const receipt = session.receipt
    receipt.startedAt = journal.lifecycle.createdAt
    receipt.sandboxAddress = journal.sandboxAddress
    receipt.treasuryAddress = journal.treasuryAddress
    receipt.initialGasReserveWei = journal.gasReserveWei
    receipt.fundingTransactions = structuredClone(journal.transactions.funding)
    receipt.activity = structuredClone(journal.activity)
    receipt.usdtReturnedToTreasuryBaseUnits = usdtSweep.amount.toString()
    receipt.ethReturnedToTreasuryWei = ethSweep.amount.toString()
    receipt.returnTransactions = structuredClone(journal.transactions.returns)
    receipt.finalSandboxUsdtBalanceBaseUnits = usdtSweep.remaining?.toString() ?? null
    receipt.finalSandboxEthBalanceWei = ethSweep.remaining?.toString() ?? null
    receipt.sandboxDisposalStatus = 'disposed'
    receipt.cleanup.mcpStatus = 'recovered_after_crash'
    receipt.financialSession.status = 'recovered'
    finalizeSessionReceipt(session, {
      initialUsdtBalance: BigInt(journal.budgetBaseUnits),
      finalUsdtBalance: usdtBalance,
      exitCode: 0
    })
    await persistReceipt(receipt, options)

    transitionSessionJournal(journal, 'recovered', {}, options)
    await persistJournal(journal, recovery.journalKey, options)
    output.log(`  Returned   ${formatUsdtBaseUnits(usdtSweep.amount)}`)
    output.log(`  Gas back   ${formatEthBaseUnits(ethSweep.amount)}`)
    output.log('  Status     recovered and disposed')
    return true
  } finally {
    try { sandbox?.dispose() } catch {}
    try { await releaseSessionLease?.() } catch {}
    recovery.seed.fill(0)
    recovery.journalKey.fill(0)
  }
}

export async function recoverCommand (args, options, output) {
  if (args.length > 2) {
    output.error('Usage: ration recover [session-id]')
    return 1
  }
  const standard = await requireStandardSepolia(options, output)
  if (!standard) return 1

  let journals
  try {
    journals = args[1]
      ? [await (options.readSessionJournal ?? readSessionJournal)(args[1], options)]
      : await (options.listIncompleteSessionJournals ?? listIncompleteSessionJournals)(options)
  } catch {
    output.error('Could not read the Ration recovery journal.')
    return 1
  }
  if (journals.length === 0) {
    if (journals.invalidCount > 0) {
      output.error(`${journals.invalidCount} recovery journal${journals.invalidCount === 1 ? '' : 's'} failed integrity validation.`)
      return 1
    }
    output.log('No funded Ration sessions require recovery.')
    return 0
  }
  if (journals.invalidCount > 0) {
    output.error(`Skipping ${journals.invalidCount} recovery journal${journals.invalidCount === 1 ? '' : 's'} that failed integrity validation.`)
  }

  let success = !(journals.invalidCount > 0)
  for (const journal of journals) {
    try {
      if (!(await recoverOne(journal, standard, options, output))) success = false
    } catch (error) {
      success = false
      const id = typeof journal?.sessionId === 'string' ? shortSessionId(journal.sessionId) : 'unknown'
      output.error(`Recovery failed for session ${id}: ${error.message}`)
    }
  }
  return success ? 0 : 1
}
