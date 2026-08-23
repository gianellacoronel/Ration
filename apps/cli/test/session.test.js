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
  renderSessionDetails,
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
  value.receipt.sandboxTree = {
    rootId: 'root',
    nodes: [{
      id: 'root',
      name: 'root',
      parentId: null,
      address: value.receipt.sandboxAddress,
      status: 'disposed',
      disposalStatus: 'disposed'
    }, {
      id: 'root/1',
      name: 'research',
      parentId: 'root',
      address: '0xaA12ce98df280eE1d2168e14D0DD79A1Df1efc08',
      delegatedBudgetBaseUnits: '20000',
      usdtReturnedToParentBaseUnits: '20000',
      ethReturnedToParentWei: '10000',
      status: 'closed',
      disposalStatus: 'disposed',
      transactions: {
        funding: {
          eth: null,
          usdt: {
            transactionHash: '0xchildfund',
            status: 'confirmed'
          }
        },
        returns: {
          usdt: {
            transactionHash: '0xchildreturn',
            status: 'confirmed'
          },
          eth: []
        }
      }
    }]
  }
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
  assert.match(lines, /Session 11111111/)
  assert.match(lines, /root\s+0\.10 USDT/)
  assert.match(lines, /├── research\s+0\.02 USDT/)
  assert.match(lines, /│   spent\s+0\.00 USDT/)
  assert.match(lines, /│   returned\s+0\.02 USDT/)
  assert.match(lines, /└── root available\s+0\.03 USDT/)
  assert.match(lines, /Total spent\s+0\.07 USDT/)
  assert.match(lines, /Returned\s+0\.03 USDT/)

  const details = renderSessionDetails(receipt).join('\n')
  assert.match(details, /Ration session 11111111/)
  assert.match(details, /Delegated sandboxes[\s\S]*research/)
  assert.match(details, /Address\s+0xaA12ce98df280eE1d2168e14D0DD79A1Df1efc08/)
  assert.match(details, /Budget\s+0\.02 USDT/)
  assert.match(details, /USDT returned\s+0\.02 USDT/)
  assert.match(details, /research USDT funding\s+0xchildfund\s+confirmed/)
  assert.doesNotMatch(details, /schemaVersion|amountBaseUnits|transactions":/)
})

test('renders the one-child acceptance financial tree', () => {
  const value = session({ budgetBaseUnits: 500000n })
  value.receipt.usdtReturnedToTreasuryBaseUnits = '440000'
  value.receipt.sandboxTree = {
    rootId: 'root',
    nodes: [{
      id: 'root', name: 'root', parentId: null, address: '0xroot', status: 'open'
    }, {
      id: 'root/1',
      name: 'research',
      parentId: 'root',
      address: '0xresearch',
      delegatedBudgetBaseUnits: '200000',
      usdtReturnedToParentBaseUnits: '140000',
      status: 'closed',
      disposalStatus: 'disposed'
    }]
  }
  const receipt = finalizeSessionReceipt(value, {
    initialUsdtBalance: 500000n,
    finalUsdtBalance: 440000n
  })

  assert.equal(renderSessionSummary(receipt).join('\n'), [
    'Session 11111111',
    '',
    'root                 0.50 USDT',
    '├── research         0.20 USDT',
    '│   spent            0.06 USDT',
    '│   returned         0.14 USDT',
    '└── root available   0.44 USDT',
    '',
    'Total spent          0.06 USDT',
    'Returned             0.44 USDT'
  ].join('\n'))
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
