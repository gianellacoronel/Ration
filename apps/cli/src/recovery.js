import { createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveRationDataDirectory } from './session.js'

const RECOVERY_SERVICE = 'io.ration.cli.recovery-root'
const RECOVERY_ACCOUNT = 'ration'
const ROOT_BYTES = 32
const SEED_BYTES = 64
const JOURNAL_KEY_BYTES = 32
const JOURNAL_SCHEMA_VERSION = 1
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHORT_SESSION_ID_PATTERN = /^[0-9a-f]{8}$/i
const COMPLETE_STATES = new Set(['complete', 'recovered'])
const LEASE_STALE_MS = 30000

export class SecureCredentialStoreError extends Error {
  constructor (message = 'A secure OS credential store is required for crash recovery.') {
    super(message)
    this.name = 'SecureCredentialStoreError'
  }
}

export function createOsCredentialStore (options = {}) {
  let keytar
  const load = async () => {
    if (keytar) return keytar
    try {
      keytar = options.keytar ?? (await import('@github/keytar')).default
      if (typeof keytar?.getPassword !== 'function' || typeof keytar?.setPassword !== 'function') throw new Error()
      return keytar
    } catch {
      throw new SecureCredentialStoreError()
    }
  }
  return {
    async get () {
      try {
        return await (await load()).getPassword(RECOVERY_SERVICE, RECOVERY_ACCOUNT)
      } catch (error) {
        if (error instanceof SecureCredentialStoreError) throw error
        throw new SecureCredentialStoreError()
      }
    },
    async set (secret) {
      try {
        await (await load()).setPassword(RECOVERY_SERVICE, RECOVERY_ACCOUNT, secret)
      } catch (error) {
        if (error instanceof SecureCredentialStoreError) throw error
        throw new SecureCredentialStoreError()
      }
    }
  }
}

function processIsAlive (pid, options = {}) {
  if (options.isProcessAlive) return options.isProcessAlive(pid)
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function acquireFileLease (path, options = {}) {
  await (options.mkdirImpl ?? mkdir)(join(path, '..'), { recursive: true, mode: 0o700 })
  await (options.chmodImpl ?? chmod)(join(path, '..'), 0o700)
  const openFile = options.openImpl ?? open
  const remove = options.rmImpl ?? rm
  for (let attempt = 0; attempt < 3; attempt++) {
    let handle
    try {
      const token = (options.randomUUID ?? randomUUID)()
      handle = await openFile(path, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() })}\n`, 'utf8')
      await handle.sync()
      await handle.close()
      return async () => {
        let owner
        try { owner = JSON.parse(await (options.readFileImpl ?? readFile)(path, 'utf8')) } catch {}
        if (owner?.token === token) await remove(path, { force: true })
      }
    } catch (error) {
      try { await handle?.close() } catch {}
      if (error?.code !== 'EEXIST') throw error
      let owner
      try { owner = JSON.parse(await (options.readFileImpl ?? readFile)(path, 'utf8')) } catch {}
      let stale = false
      try {
        const metadata = await (options.statImpl ?? stat)(path)
        stale = Date.now() - metadata.mtimeMs >= (options.leaseStaleMs ?? LEASE_STALE_MS)
      } catch {}
      if (Number.isInteger(owner?.pid) && processIsAlive(owner.pid, options)) {
        throw new Error('Another Ration process is already handling this recovery state.')
      }
      if (!Number.isInteger(owner?.pid) && !stale) {
        throw new Error('Another Ration process is initializing recovery state.')
      }
      await remove(path, { force: true })
    }
  }
  throw new Error('Could not acquire the Ration recovery lease.')
}

function decodeRoot (encoded) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new SecureCredentialStoreError('The Ration recovery root in the OS credential store is invalid.')
  }
  const root = Buffer.from(encoded, 'base64')
  if (root.length !== ROOT_BYTES || root.toString('base64') !== encoded) {
    root.fill(0)
    throw new SecureCredentialStoreError('The Ration recovery root in the OS credential store is invalid.')
  }
  return root
}

export async function ensureRecoveryRoot (options = {}) {
  if (options.recoveryRoot) return Buffer.from(options.recoveryRoot)
  const store = options.credentialStore ?? createOsCredentialStore(options)
  let encoded = await store.get()
  if (!encoded) {
    const directory = options.dataDirectory ?? resolveRationDataDirectory(options)
    const release = await acquireFileLease(join(directory, 'recovery-root.lock'), options)
    try {
      encoded = await store.get()
      if (!encoded) {
        const root = (options.randomBytes ?? randomBytes)(ROOT_BYTES)
        encoded = Buffer.from(root).toString('base64')
        root.fill(0)
        await store.set(encoded)
        encoded = await store.get()
        if (!encoded) throw new SecureCredentialStoreError('The OS credential store did not retain the Ration recovery root.')
      }
    } finally {
      await release()
    }
  }
  return decodeRoot(encoded)
}

export async function prepareRecoverySession (sessionId, options = {}) {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error('Invalid session id.')
  const root = await (options.ensureRecoveryRoot ?? ensureRecoveryRoot)(options)
  try {
    const salt = Buffer.from(sessionId.toLowerCase(), 'utf8')
    return {
      seed: Buffer.from(hkdfSync('sha256', root, salt, 'ration/sandbox-seed/v1', SEED_BYTES)),
      journalKey: Buffer.from(hkdfSync('sha256', root, salt, 'ration/session-journal/v1', JOURNAL_KEY_BYTES))
    }
  } finally {
    root.fill(0)
  }
}

function journalDirectory (options = {}) {
  return join(options.dataDirectory ?? resolveRationDataDirectory(options), 'recovery')
}

export function acquireSessionLease (sessionId, options = {}) {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error('Invalid session id.')
  return acquireFileLease(join(journalDirectory(options), `${sessionId}.lock`), options)
}

function allowlistedObject (value, fields) {
  if (!value) return null
  return Object.fromEntries(fields
    .filter((field) => value[field] !== undefined)
    .map((field) => [field, value[field]]))
}

function journalSandboxTree (tree) {
  if (!tree) return undefined
  return {
    rootId: 'root',
    nodes: (tree.nodes ?? []).map((node) => ({
      ...allowlistedObject(node, [
        'id', 'name', 'parentId', 'address', 'delegatedBudgetBaseUnits',
        'gasReserveWei', 'status', 'disposalStatus', 'cleanupStatus', 'createdAt', 'closedAt',
        'agentStatus', 'agentExitCode', 'agentSignal', 'agentStartedAt', 'agentFinishedAt',
        'usdtReturnedToParentBaseUnits', 'ethReturnedToParentWei',
        'finalUsdtBalanceBaseUnits', 'finalEthBalanceWei'
      ]),
      ...(node.transactions
        ? {
            transactions: {
              funding: {
                eth: allowlistedObject(node.transactions.funding?.eth, [
                  'asset', 'amountBaseUnits', 'recipientAddress', 'transactionHash',
                  'feeWei', 'status'
                ]),
                usdt: allowlistedObject(node.transactions.funding?.usdt, [
                  'asset', 'amountBaseUnits', 'recipientAddress', 'transactionHash',
                  'feeWei', 'status'
                ])
              },
              returns: {
                usdt: allowlistedObject(node.transactions.returns?.usdt, [
                  'asset', 'amountBaseUnits', 'recipientAddress', 'transactionHash',
                  'feeWei', 'status'
                ]),
                eth: (node.transactions.returns?.eth ?? []).map((transaction) =>
                  allowlistedObject(transaction, [
                    'asset', 'amountBaseUnits', 'recipientAddress', 'transactionHash',
                    'feeWei', 'status'
                  ]))
              }
            }
          }
        : {})
    }))
  }
}

function journalPayload (journal) {
  const payload = {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    sessionId: journal.sessionId,
    network: { name: 'sepolia', chainId: 11155111 },
    sandboxAddress: journal.sandboxAddress,
    treasuryAddress: journal.treasuryAddress,
    budgetBaseUnits: String(journal.budgetBaseUnits),
    gasReserveWei: String(journal.gasReserveWei),
    childCommand: {
      executable: journal.childCommand?.executable ?? 'unknown',
      argumentCount: journal.childCommand?.argumentCount ?? 0
    },
    owner: {
      pid: journal.owner?.pid ?? null,
      startedAt: journal.owner?.startedAt ?? null
    },
    lifecycle: {
      state: journal.lifecycle.state,
      createdAt: journal.lifecycle.createdAt,
      updatedAt: journal.lifecycle.updatedAt,
      fundedAt: journal.lifecycle.fundedAt ?? null,
      runningAt: journal.lifecycle.runningAt ?? null,
      expiresAt: journal.lifecycle.expiresAt ?? null,
      expiredAt: journal.lifecycle.expiredAt ?? null,
      sweepingAt: journal.lifecycle.sweepingAt ?? null,
      completedAt: journal.lifecycle.completedAt ?? null,
      recoveredAt: journal.lifecycle.recoveredAt ?? null
    },
    transactions: {
      funding: {
        eth: allowlistedObject(journal.transactions?.funding?.eth, [
          'amountWei', 'recipientAddress', 'transactionHash', 'status', 'submittedAt', 'confirmedAt'
        ]),
        usdt: allowlistedObject(journal.transactions?.funding?.usdt, [
          'amountBaseUnits', 'recipientAddress', 'transactionHash', 'status', 'submittedAt', 'confirmedAt'
        ])
      },
      returns: {
        usdt: allowlistedObject(journal.transactions?.returns?.usdt, [
          'amountBaseUnits', 'attemptedAmountBaseUnits', 'recipientAddress', 'transactionHash',
          'feeWei', 'remainingBaseUnits', 'status'
        ]),
        eth: (journal.transactions?.returns?.eth ?? []).map((transaction) =>
          allowlistedObject(transaction, [
            'amountWei', 'recipientAddress', 'transactionHash', 'feeWei', 'status'
          ]))
      }
    },
    activity: (journal.activity ?? []).map((activity) => allowlistedObject(activity, [
      'activityId', 'type', 'resource', 'amountBaseUnits', 'recipientAddress',
      'transactionHash', 'feeWei', 'status', 'submittedAt', 'broadcastAt',
      'confirmedAt', 'failedAt', 'sandboxId', 'sandboxName', 'walletAddress'
    ]))
  }
  if (journal.sandboxTree !== undefined) payload.sandboxTree = journalSandboxTree(journal.sandboxTree)
  return payload
}

function journalMac (payload, journalKey) {
  return createHmac('sha256', journalKey).update(JSON.stringify(payload)).digest('hex')
}

export function createSessionJournal (input, options = {}) {
  const now = (options.now?.() ?? new Date()).toISOString()
  return journalPayload({
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    sessionId: input.sessionId,
    sandboxAddress: input.sandboxAddress,
    treasuryAddress: input.treasuryAddress,
    budgetBaseUnits: input.budgetBaseUnits,
    gasReserveWei: input.gasReserveWei,
    childCommand: input.childCommand,
    owner: input.owner ?? { pid: process.pid, startedAt: now },
    lifecycle: { state: 'created', createdAt: now, updatedAt: now },
    transactions: { funding: { eth: null, usdt: null }, returns: { usdt: null, eth: [] } },
    sandboxTree: input.sandboxTree ?? { rootId: 'root', nodes: [] },
    activity: []
  })
}

export function transitionSessionJournal (journal, state, update = {}, options = {}) {
  const now = (options.now?.() ?? new Date()).toISOString()
  Object.assign(journal, update)
  journal.lifecycle.state = state
  journal.lifecycle.updatedAt = now
  const timestampField = {
    funded: 'fundedAt',
    running: 'runningAt',
    expired: 'expiredAt',
    sweeping: 'sweepingAt',
    complete: 'completedAt',
    recovered: 'recoveredAt'
  }[state]
  if (timestampField) journal.lifecycle[timestampField] ??= now
  return journal
}

export async function persistSessionJournal (journal, journalKey, options = {}) {
  if (!SESSION_ID_PATTERN.test(journal.sessionId)) throw new Error('Invalid session id.')
  const payload = journalPayload(journal)
  const stored = {
    ...payload,
    integrity: { algorithm: 'hmac-sha256', value: journalMac(payload, journalKey) }
  }
  const directory = journalDirectory(options)
  const path = join(directory, `${journal.sessionId}.json`)
  const temporaryPath = join(directory, `.${journal.sessionId}.${(options.randomUUID ?? randomUUID)()}.tmp`)
  const makeDirectory = options.mkdirImpl ?? mkdir
  const setMode = options.chmodImpl ?? chmod
  const openFile = options.openImpl ?? open
  const move = options.renameImpl ?? rename
  const remove = options.rmImpl ?? rm
  await makeDirectory(directory, { recursive: true, mode: 0o700 })
  await setMode(directory, 0o700)
  let temporaryFile
  try {
    temporaryFile = await openFile(temporaryPath, 'wx', 0o600)
    await temporaryFile.writeFile(`${JSON.stringify(stored, null, 2)}\n`, 'utf8')
    await temporaryFile.sync()
    await temporaryFile.close()
    temporaryFile = undefined
    await move(temporaryPath, path)
    const directoryHandle = await openFile(directory, 'r')
    try {
      await directoryHandle.sync()
    } finally {
      await directoryHandle.close()
    }
  } catch (error) {
    try { await temporaryFile?.close() } catch {}
    try { await remove(temporaryPath, { force: true }) } catch {}
    throw error
  }
  return path
}

function validateJournalShape (journal, requireIntegrity = true) {
  const childNodes = journal?.sandboxTree?.nodes?.filter((node) => node.parentId !== null) ?? []
  const validTree = childNodes.length <= 3 && childNodes.every((node) =>
    /^root\/[1-3]$/.test(node.id) && node.parentId === 'root') &&
    new Set(childNodes.map((node) => node.id)).size === childNodes.length &&
    new Set(childNodes.map((node) => node.name)).size === childNodes.length &&
    new Set(childNodes.map((node) => String(node.address).toLowerCase())).size === childNodes.length
  return journal?.schemaVersion === JOURNAL_SCHEMA_VERSION &&
    SESSION_ID_PATTERN.test(journal.sessionId) &&
    typeof journal.sandboxAddress === 'string' &&
    typeof journal.treasuryAddress === 'string' &&
    /^\d+$/.test(journal.budgetBaseUnits) &&
    /^\d+$/.test(journal.gasReserveWei) &&
    typeof journal.lifecycle?.state === 'string' &&
    typeof journal.lifecycle?.createdAt === 'string' &&
    validTree &&
    (journal.owner?.pid === null || Number.isInteger(journal.owner?.pid)) &&
    (!requireIntegrity || typeof journal.integrity?.value === 'string')
}

export function verifySessionJournal (journal, journalKey) {
  if (!validateJournalShape(journal) || journal.integrity.algorithm !== 'hmac-sha256') {
    throw new Error('The recovery journal is invalid.')
  }
  const payload = journalPayload(journal)
  const expected = Buffer.from(journalMac(payload, journalKey), 'hex')
  const received = Buffer.from(journal.integrity.value, 'hex')
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error('The recovery journal failed its integrity check.')
  }
  return payload
}

async function resolveJournalId (sessionId, options = {}) {
  if (SESSION_ID_PATTERN.test(sessionId)) return sessionId
  if (!SHORT_SESSION_ID_PATTERN.test(sessionId)) throw new Error('Invalid session id.')
  const entries = await (options.readdirImpl ?? readdir)(journalDirectory(options), { withFileTypes: true })
  const matches = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json') &&
    entry.name.toLowerCase().startsWith(`${sessionId.toLowerCase()}-`))
  if (matches.length === 0) {
    const error = new Error(`Recovery session not found: ${sessionId}`)
    error.code = 'ENOENT'
    throw error
  }
  if (matches.length > 1) throw new Error('Ambiguous session id.')
  return matches[0].name.slice(0, -5)
}

export async function readSessionJournal (sessionId, options = {}) {
  const resolvedId = await resolveJournalId(sessionId, options)
  return JSON.parse(await (options.readFileImpl ?? readFile)(
    join(journalDirectory(options), `${resolvedId}.json`), 'utf8'))
}

export function journalNeedsRecovery (journal) {
  if (!validateJournalShape(journal, false) || COMPLETE_STATES.has(journal.lifecycle.state)) return false
  return Boolean(journal.transactions?.funding?.eth?.submittedAt ||
    journal.transactions?.funding?.usdt?.submittedAt ||
    ['funded', 'running', 'expired', 'sweeping'].includes(journal.lifecycle.state))
}

export async function listIncompleteSessionJournals (options = {}) {
  let entries
  try {
    entries = await (options.readdirImpl ?? readdir)(journalDirectory(options), { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const candidates = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  if (candidates.length === 0) return []
  const root = await (options.ensureRecoveryRoot ?? ensureRecoveryRoot)(options)
  let settled
  try {
    settled = await Promise.allSettled(candidates.map(async (entry) => {
      const stored = JSON.parse(await (options.readFileImpl ?? readFile)(join(journalDirectory(options), entry.name), 'utf8'))
      if (!SESSION_ID_PATTERN.test(stored?.sessionId) || entry.name !== `${stored.sessionId}.json`) {
        throw new Error('The recovery journal is invalid.')
      }
      const recovery = await prepareRecoverySession(stored.sessionId, { ...options, recoveryRoot: root })
      try {
        const verified = verifySessionJournal(stored, recovery.journalKey)
        return journalNeedsRecovery(verified) ? stored : null
      } finally {
        recovery.seed.fill(0)
        recovery.journalKey.fill(0)
      }
    }))
  } finally {
    root.fill(0)
  }
  const journals = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter(Boolean)
    .sort((left, right) =>
      String(left.lifecycle.createdAt).localeCompare(String(right.lifecycle.createdAt)))
  Object.defineProperty(journals, 'invalidCount', {
    value: settled.filter((result) => result.status === 'rejected').length,
    enumerable: false
  })
  return journals
}
