import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  acquireSessionLease,
  createSessionJournal,
  ensureRecoveryRoot,
  listIncompleteSessionJournals,
  main,
  persistSessionJournal,
  prepareRecoverySession,
  readSessionJournal,
  transitionSessionJournal,
  verifySessionJournal
} from '../src/cli.js'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_SESSION_ID = '22222222-2222-4222-8222-222222222222'
const STANDARD_CONFIG = {
  chainId: 11155111,
  provider: 'https://example.test',
  transferMaxFee: 5000000000000000
}

function captureOutput () {
  const logs = []
  const errors = []
  return {
    logs,
    errors,
    output: { log: (line) => logs.push(line), error: (line) => errors.push(line) }
  }
}

function fundedJournal () {
  const journal = createSessionJournal({
    sessionId: SESSION_ID,
    sandboxAddress: '0xEphemeral',
    treasuryAddress: '0xTreasury',
    budgetBaseUnits: 100000n,
    gasReserveWei: 200000n,
    childCommand: { executable: 'codex', argumentCount: 0 }
  }, { now: () => new Date('2026-08-23T12:00:00.000Z') })
  journal.transactions.funding.eth = {
    amountWei: '200000',
    recipientAddress: '0xEphemeral',
    transactionHash: '0xfundeth',
    status: 'confirmed_by_balance',
    submittedAt: '2026-08-23T12:00:01.000Z'
  }
  journal.transactions.funding.usdt = {
    amountBaseUnits: '100000',
    recipientAddress: '0xEphemeral',
    transactionHash: '0xfundusdt',
    status: 'confirmed_by_balance',
    submittedAt: '2026-08-23T12:00:02.000Z'
  }
  transitionSessionJournal(journal, 'running', {}, {
    now: () => new Date('2026-08-23T12:00:03.000Z')
  })
  return journal
}

test('stores one recovery root only in a credential store and deterministically derives isolated seeds', async () => {
  let stored
  const credentialStore = {
    get: async () => stored ?? null,
    set: async (value) => { stored = value }
  }
  const firstRoot = await ensureRecoveryRoot({
    credentialStore,
    randomBytes: () => Buffer.alloc(32, 7)
  })
  const secondRoot = await ensureRecoveryRoot({ credentialStore })
  assert.deepEqual(firstRoot, secondRoot)
  assert.equal(Buffer.from(stored, 'base64').length, 32)

  const first = await prepareRecoverySession(SESSION_ID, { recoveryRoot: firstRoot })
  const repeat = await prepareRecoverySession(SESSION_ID, { recoveryRoot: secondRoot })
  const other = await prepareRecoverySession(OTHER_SESSION_ID, { recoveryRoot: secondRoot })
  assert.deepEqual(first.seed, repeat.seed)
  assert.notDeepEqual(first.seed, other.seed)
  assert.notDeepEqual(first.seed.subarray(0, 32), first.journalKey)
  firstRoot.fill(0)
  secondRoot.fill(0)
  first.seed.fill(0)
  first.journalKey.fill(0)
  repeat.seed.fill(0)
  repeat.journalKey.fill(0)
  other.seed.fill(0)
  other.journalKey.fill(0)
})

test('persists an authenticated non-secret atomic journal and detects funded sessions', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'ration-recovery-test-'))
  const recoveryRoot = Buffer.alloc(32, 8)
  const recovery = await prepareRecoverySession(SESSION_ID, { recoveryRoot })
  const journalKey = recovery.journalKey
  try {
    const journal = fundedJournal()
    const path = await persistSessionJournal(journal, journalKey, { dataDirectory })
    const serialized = await readFile(path, 'utf8')
    assert.doesNotMatch(serialized, /seed|private.?key|passphrase|recovery.?root/i)
    assert.match(serialized, /hmac-sha256/)
    const stored = await readSessionJournal(SESSION_ID, { dataDirectory })
    assert.equal(verifySessionJournal(stored, journalKey).lifecycle.state, 'running')
    assert.deepEqual((await listIncompleteSessionJournals({ dataDirectory, recoveryRoot }))
      .map((value) => value.sessionId), [SESSION_ID])

    stored.treasuryAddress = '0xAttacker'
    assert.throws(() => verifySessionJournal(stored, journalKey), /integrity check/)

    transitionSessionJournal(journal, 'complete')
    await persistSessionJournal(journal, journalKey, { dataDirectory })
    assert.deepEqual(await listIncompleteSessionJournals({ dataDirectory, recoveryRoot }), [])
  } finally {
    recovery.seed.fill(0)
    journalKey.fill(0)
    recoveryRoot.fill(0)
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('recover reconstructs, sweeps once, disposes, writes a receipt, and is idempotent', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'ration-recover-command-test-'))
  const recoveryRoot = Buffer.alloc(32, 4)
  const recovery = await prepareRecoverySession(SESSION_ID, { recoveryRoot })
  const journalKey = recovery.journalKey
  const seed = recovery.seed
  const events = []
  const { logs, errors, output } = captureOutput()
  try {
    await persistSessionJournal(fundedJournal(), journalKey, { dataDirectory })
    const options = {
      output,
      dataDirectory,
      recoveryRoot,
      runWdkGetNetworkConfig: async () => STANDARD_CONFIG,
      createEphemeralSandbox: async () => ({
        address: '0xEphemeral',
        getUsdtBalance: async () => 80000n,
        getEthBalance: async () => 100000n,
        sweepUsdt: async (recipient) => {
          events.push(['sweep-usdt', recipient])
          return { amount: 80000n, fee: 40000n, hash: '0xusdtback', remaining: 0n }
        },
        sweepEth: async (recipient) => {
          events.push(['sweep-eth', recipient])
          return {
            amount: 79000n,
            fee: 21000n,
            remaining: 0n,
            transactions: [{ amount: 79000n, fee: 21000n, hash: '0xethback' }]
          }
        },
        dispose: () => events.push(['dispose'])
      })
    }

    assert.equal(await main(['recover'], options), 0)
    assert.deepEqual(errors, [])
    assert.deepEqual(events.map((event) => event[0]), ['sweep-usdt', 'sweep-eth', 'dispose'])
    assert.match(logs.join('\n'), /recovered and disposed/)
    const recovered = await readSessionJournal(SESSION_ID, { dataDirectory })
    assert.equal(verifySessionJournal(recovered, journalKey).lifecycle.state, 'recovered')
    const receipt = JSON.parse(await readFile(join(dataDirectory, 'sessions', `${SESSION_ID}.json`), 'utf8'))
    assert.equal(receipt.financialSession.status, 'recovered')
    assert.equal(receipt.usdtReturnedToTreasuryBaseUnits, '80000')

    assert.equal(await main(['recover', SESSION_ID], options), 0)
    assert.deepEqual(events.map((event) => event[0]), ['sweep-usdt', 'sweep-eth', 'dispose'])
    assert.match(logs.at(-1), /already complete/)
  } finally {
    seed.fill(0)
    journalKey.fill(0)
    recoveryRoot.fill(0)
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('startup clearly surfaces an incomplete funded session', async () => {
  const { errors, output } = captureOutput()
  assert.equal(await main(['status'], {
    output,
    listIncompleteSessionJournals: async () => [fundedJournal()],
    runWdkGetNetworkConfig: async () => STANDARD_CONFIG,
    runWdkWalletList: async () => [{ name: 'rationtreasury', unlocked: true }],
    runWdkGetAddress: async () => ({ address: '0xTreasury' }),
    runWdkGetUsdtBalance: async () => ({ balance: '100000', formatted: '0.1 USDT' }),
    runWdkGetEthBalance: async () => ({ balance: '100000', formatted: '0.0000000000001 ETH' }),
    runWdkWalletLock: async () => {}
  }), 0)
  assert.match(errors.join('\n'), /Recovery required: 1 funded Ration session/)
  assert.match(errors.join('\n'), /ration recover 11111111/)
})

test('session leases serialize recovery attempts', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'ration-lease-test-'))
  try {
    const release = await acquireSessionLease(SESSION_ID, { dataDirectory })
    await assert.rejects(acquireSessionLease(SESSION_ID, { dataDirectory }), /already handling/)
    await release()
    const releaseAgain = await acquireSessionLease(SESSION_ID, { dataDirectory })
    await releaseAgain()
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('recovery preserves ETH while an unknown USDT funding submission may still arrive', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'ration-unsettled-funding-test-'))
  const recoveryRoot = Buffer.alloc(32, 6)
  const recovery = await prepareRecoverySession(SESSION_ID, { recoveryRoot })
  const journal = fundedJournal()
  journal.transactions.funding.usdt.transactionHash = null
  journal.transactions.funding.usdt.status = 'submission_unknown'
  const events = []
  const { errors, output } = captureOutput()
  try {
    await persistSessionJournal(journal, recovery.journalKey, { dataDirectory })
    const exitCode = await main(['recover', SESSION_ID], {
      output,
      dataDirectory,
      recoveryRoot,
      runWdkGetNetworkConfig: async () => STANDARD_CONFIG,
      createEphemeralSandbox: async () => ({
        address: '0xEphemeral',
        getUsdtBalance: async () => 0n,
        getEthBalance: async () => 100000n,
        sweepUsdt: async () => { events.push('sweep-usdt') },
        sweepEth: async () => { events.push('sweep-eth') },
        dispose: () => events.push('dispose')
      })
    })
    assert.equal(exitCode, 1)
    assert.deepEqual(events, ['dispose'])
    assert.match(errors.join('\n'), /funding submission is still unresolved/)
    const incomplete = await readSessionJournal(SESSION_ID, { dataDirectory })
    assert.equal(verifySessionJournal(incomplete, recovery.journalKey).lifecycle.state, 'sweeping')
  } finally {
    recovery.seed.fill(0)
    recovery.journalKey.fill(0)
    recoveryRoot.fill(0)
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
