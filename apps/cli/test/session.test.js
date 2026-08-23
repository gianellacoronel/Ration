import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  createSessionReceipt,
  finalizeSessionReceipt,
  listSessionReceipts,
  persistSessionReceipt,
  readSessionReceipt,
  renderHistory,
  renderSessionSummary,
  resolveRationDataDirectory
} from '../src/session.js'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const SECOND_SESSION_ID = '22222222-2222-4222-8222-222222222222'

function session (overrides = {}) {
  return createSessionReceipt({
    budgetBaseUnits: 100000n,
    command: 'codex',
    commandArgs: ['exec', 'research'],
    ...overrides
  }, {
    randomUUID: () => SESSION_ID,
    now: () => new Date('2026-08-23T12:00:00.000Z')
  })
}

test('creates an allowlisted receipt without persisting child arguments', () => {
  const value = session({
    commandArgs: [
      '--api-key', 'never-store-this',
      '--passphrase=also-never-store-this',
      'https://user:password@example.test/path'
    ]
  }).receipt
  const serialized = JSON.stringify(value)

  assert.equal(value.schemaVersion, 1)
  assert.equal(value.sessionId, SESSION_ID)
  assert.equal(value.childCommand.executable, 'codex')
  assert.equal(value.childCommand.argumentCount, 4)
  assert.equal(value.childCommand.argumentsPersisted, false)
  assert.doesNotMatch(serialized, /never-store-this|also-never-store-this|password|api-key/)
  assert.equal('seed' in value, false)
  assert.equal('privateKey' in value, false)
})

test('finalizes totals and renders purchases, transfers, returns, and disposal', () => {
  const value = session()
  value.receipt.sandboxAddress = '0x1234567890123456789012345678901234567890'
  value.receipt.usdtReturnedToTreasuryBaseUnits = '30000'
  value.receipt.ethReturnedToTreasuryWei = '140000000000000'
  value.receipt.sandboxDisposalStatus = 'disposed'
  value.recordActivity({
    type: 'resource_purchase',
    resource: 'deep-research',
    amountBaseUnits: '20000',
    recipientAddress: '0xseller',
    transactionHash: '0xpurchase',
    status: 'confirmed'
  })
  value.recordActivity({
    type: 'direct_usdt_transfer',
    resource: null,
    amountBaseUnits: '50000',
    recipientAddress: '0x5e4700000000000000000000000000000000f214',
    transactionHash: '0xtransfer',
    status: 'confirmed'
  })

  const receipt = finalizeSessionReceipt(value, {
    initialUsdtBalance: 100000n,
    finalUsdtBalance: 30000n,
    exitCode: 0
  })
  const lines = renderSessionSummary(receipt).join('\n')

  assert.equal(receipt.totalUsdtSpentBaseUnits, '70000')
  assert.equal(receipt.unrecoveredUsdtBaseUnits, '0')
  assert.match(lines, /Budget      0\.10 USDT/)
  assert.match(lines, /Spent       0\.07 USDT/)
  assert.match(lines, /Amount\s+Resource \/ recipient\s+Status/)
  assert.match(lines, /-0\.02 USDT\s+deep-research\s+confirmed/)
  assert.match(lines, /-0\.05 USDT\s+0x5e4700\.\.\.f214\s+confirmed/)
  assert.match(lines, /Gas back    0\.00014 ETH/)
  assert.match(lines, /Sandbox     disposed/)
})

test('persists private atomic JSON and reads recent receipts', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'ration-session-test-'))
  try {
    const first = session()
    first.receipt.sandboxDisposalStatus = 'disposed'
    finalizeSessionReceipt(first, { exitCode: 0 })
    const firstPath = await persistSessionReceipt(first.receipt, { dataDirectory })

    const second = createSessionReceipt({
      budgetBaseUnits: 200000n,
      command: 'opencode',
      commandArgs: []
    }, {
      randomUUID: () => SECOND_SESSION_ID,
      now: () => new Date('2026-08-24T12:00:00.000Z')
    })
    second.receipt.sandboxDisposalStatus = 'failed'
    finalizeSessionReceipt(second, { exitCode: 1 })
    await persistSessionReceipt(second.receipt, { dataDirectory })

    assert.equal((await stat(firstPath)).mode & 0o777, 0o600)
    assert.equal((await stat(join(dataDirectory, 'sessions'))).mode & 0o777, 0o700)
    assert.deepEqual(await readSessionReceipt(SESSION_ID, { dataDirectory }), first.receipt)
    assert.deepEqual(await readSessionReceipt(SESSION_ID.slice(0, 8), { dataDirectory }), first.receipt)
    const receipts = await listSessionReceipts({ dataDirectory })
    assert.deepEqual(receipts.map((receipt) => receipt.sessionId), [SECOND_SESSION_ID, SESSION_ID])
    assert.match(renderHistory(receipts)[2], /Session ID\s+Started\s+Spent\s+Status\s+Command/)
    assert.match(renderHistory(receipts)[3], /^22222222\s+/)
    assert.doesNotMatch(renderHistory(receipts).join('\n'), new RegExp(SECOND_SESSION_ID))
    assert.match(renderHistory(receipts)[3], /0\.00 USDT\s+failed\s+opencode/)
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('resolves a Ration-owned platform data directory', () => {
  assert.equal(resolveRationDataDirectory({
    env: { XDG_DATA_HOME: '/data' }, platform: 'linux', home: '/home/test'
  }), '/data/ration')
  assert.equal(resolveRationDataDirectory({
    env: {}, platform: 'darwin', home: '/Users/test'
  }), '/Users/test/Library/Application Support/Ration')
})

test('rejects path traversal in detailed history ids', async () => {
  await assert.rejects(readSessionReceipt('../secrets', { dataDirectory: '/tmp/ration' }), /Invalid session id/)
})

test('requires full session ids for persisted records', async () => {
  const value = session().receipt
  value.sessionId = SESSION_ID.slice(0, 8)
  await assert.rejects(persistSessionReceipt(value, { dataDirectory: '/tmp/ration' }), /Invalid session id/)
})
