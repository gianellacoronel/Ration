import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import { formatEthBaseUnits, formatUsdtBaseUnits } from './domain.js'

const RECEIPT_SCHEMA_VERSION = 1
const HISTORY_LIMIT = 20
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHORT_SESSION_ID_PATTERN = /^[0-9a-f]{8}$/i

function timestamp (now) {
  return (now?.() ?? new Date()).toISOString()
}

export function createSessionReceipt (input, options = {}) {
  const id = (options.randomUUID ?? randomUUID)()
  const now = options.now
  let activitySequence = 0
  let activityListener
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    sessionId: id,
    startedAt: timestamp(now),
    endedAt: null,
    network: { name: 'sepolia', chainId: 11155111, asset: 'USDT' },
    childCommand: {
      executable: basename(input.command),
      argumentCount: input.commandArgs?.length ?? 0,
      argumentsPersisted: false,
      exitCode: null,
      signal: null,
      status: 'not_started'
    },
    sandboxAddress: null,
    treasuryAddress: null,
    initialUsdtBudgetBaseUnits: String(input.budgetBaseUnits),
    initialGasReserveWei: null,
    fundingTransactions: { eth: null, usdt: null },
    sandboxTree: { rootId: 'root', nodes: [] },
    activity: [],
    resourcePurchaseTotalBaseUnits: '0',
    directUsdtTransferTotalBaseUnits: '0',
    totalUsdtSpentBaseUnits: '0',
    usdtReturnedToTreasuryBaseUnits: '0',
    ethReturnedToTreasuryWei: '0',
    returnTransactions: { usdt: null, eth: [] },
    preReturnSandboxUsdtBalanceBaseUnits: null,
    finalSandboxUsdtBalanceBaseUnits: null,
    finalSandboxEthBalanceWei: null,
    unrecoveredUsdtBaseUnits: '0',
    treasuryIsolation: {
      agentAccess: 'sandbox_only',
      lockedBeforeChild: false,
      finalStatus: 'unknown'
    },
    sandboxDisposalStatus: 'pending',
    cleanup: { mcpStatus: 'not_opened', errors: [] },
    financialSession: {
      ttlMs: null,
      hardTtl: false,
      expiresAt: null,
      status: 'created'
    },
    exitCode: null
  }

  return {
    receipt,
    now: () => timestamp(now),
    recordActivity (activity) {
      const activityId = `${id}:${++activitySequence}`
      receipt.activity.push({ activityId, ...activity })
      return activityId
    },
    updateActivity (activityId, update) {
      const activity = receipt.activity.find((entry) => entry.activityId === activityId)
      if (activity) Object.assign(activity, update)
    },
    recordCleanupError (stage, message) {
      receipt.cleanup.errors.push({ stage, message, at: timestamp(now) })
    },
    setActivityListener (listener) {
      activityListener = listener
    },
    setSandboxTree (tree) {
      receipt.sandboxTree = structuredClone(tree)
    },
    flushActivity () {
      return activityListener?.()
    }
  }
}

export function finalizeSessionReceipt (session, input = {}) {
  const receipt = session.receipt
  const observedSpent = input.initialUsdtBalance !== undefined && input.finalUsdtBalance !== undefined
    ? BigInt(input.initialUsdtBalance) - BigInt(input.finalUsdtBalance)
    : null
  const recordedSpent = receipt.activity
    .filter((activity) => activity.status === 'confirmed')
    .reduce((total, activity) => total + BigInt(activity.amountBaseUnits), 0n)
  const spent = observedSpent !== null && observedSpent >= 0n ? observedSpent : recordedSpent
  const budget = BigInt(receipt.initialUsdtBudgetBaseUnits)
  const returned = BigInt(receipt.usdtReturnedToTreasuryBaseUnits)

  receipt.totalUsdtSpentBaseUnits = spent.toString()
  receipt.resourcePurchaseTotalBaseUnits = receipt.activity
    .filter((activity) => activity.type === 'resource_purchase' && activity.status === 'confirmed')
    .reduce((total, activity) => total + BigInt(activity.amountBaseUnits), 0n).toString()
  receipt.directUsdtTransferTotalBaseUnits = receipt.activity
    .filter((activity) => activity.type === 'direct_usdt_transfer' && activity.status === 'confirmed')
    .reduce((total, activity) => total + BigInt(activity.amountBaseUnits), 0n).toString()
  receipt.preReturnSandboxUsdtBalanceBaseUnits = input.finalUsdtBalance === undefined
    ? null
    : String(input.finalUsdtBalance)
  const unrecovered = budget - spent - returned
  receipt.unrecoveredUsdtBaseUnits = (unrecovered > 0n ? unrecovered : 0n).toString()
  receipt.endedAt = session.now()
  receipt.exitCode = input.exitCode ?? receipt.exitCode
  return receipt
}

export function resolveRationDataDirectory (options = {}) {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  if (env.RATION_DATA_HOME) return env.RATION_DATA_HOME
  if (env.XDG_DATA_HOME) return join(env.XDG_DATA_HOME, 'ration')
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Ration')
  if (platform === 'win32' && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, 'Ration')
  return join(home, '.local', 'share', 'ration')
}

function receiptDirectory (options) {
  return join(options.dataDirectory ?? resolveRationDataDirectory(options), 'sessions')
}

function validateSessionId (sessionId) {
  if (!SESSION_ID_PATTERN.test(sessionId) && !SHORT_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Invalid session id.')
  }
}

export async function persistSessionReceipt (receipt, options = {}) {
  if (!SESSION_ID_PATTERN.test(receipt.sessionId)) throw new Error('Invalid session id.')
  const directory = receiptDirectory(options)
  const path = join(directory, `${receipt.sessionId}.json`)
  const temporaryPath = join(directory, `.${receipt.sessionId}.${(options.randomUUID ?? randomUUID)()}.tmp`)
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
    await temporaryFile.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
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

export async function readSessionReceipt (sessionId, options = {}) {
  validateSessionId(sessionId)
  const read = options.readFileImpl ?? readFile
  const directory = receiptDirectory(options)
  let resolvedSessionId = sessionId
  if (SHORT_SESSION_ID_PATTERN.test(sessionId)) {
    const readDirectory = options.readdirImpl ?? readdir
    const entries = await readDirectory(directory, { withFileTypes: true })
    const matches = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json') &&
      SESSION_ID_PATTERN.test(entry.name.slice(0, -5)) &&
      entry.name.toLowerCase().startsWith(`${sessionId.toLowerCase()}-`))
    if (matches.length === 0) {
      const error = new Error(`Session not found: ${sessionId}`)
      error.code = 'ENOENT'
      throw error
    }
    if (matches.length > 1) throw new Error('Ambiguous session id.')
    resolvedSessionId = matches[0].name.slice(0, -5)
  }
  const contents = await read(join(directory, `${resolvedSessionId}.json`), 'utf8')
  return JSON.parse(contents)
}

export async function listSessionReceipts (options = {}) {
  const readDirectory = options.readdirImpl ?? readdir
  const read = options.readFileImpl ?? readFile
  const directory = receiptDirectory(options)
  let entries
  try {
    entries = await readDirectory(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const receipts = await Promise.all(entries
    .filter((entry) => entry.isFile() && SESSION_ID_PATTERN.test(entry.name.slice(0, -5)) &&
      entry.name.endsWith('.json'))
    .map(async (entry) => {
      try {
        const receipt = JSON.parse(await read(join(directory, entry.name), 'utf8'))
        return receipt.sessionId === entry.name.slice(0, -5) ? receipt : null
      } catch {
        return null
      }
    }))
  return receipts
    .filter((receipt) => receipt?.schemaVersion === RECEIPT_SCHEMA_VERSION &&
      SESSION_ID_PATTERN.test(receipt.sessionId) && typeof receipt.startedAt === 'string' &&
      /^\d+$/.test(receipt.totalUsdtSpentBaseUnits) &&
      typeof receipt.sandboxDisposalStatus === 'string')
    .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))
    .slice(0, options.limit ?? HISTORY_LIMIT)
}

function shortAddress (address) {
  if (typeof address !== 'string' || address.length < 14) return address ?? 'unknown'
  return `${address.slice(0, 8)}...${address.slice(-4)}`
}

function shortHash (hash) {
  if (typeof hash !== 'string' || hash.length < 24) return hash ?? 'unknown'
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

export function shortSessionId (sessionId) {
  return sessionId.slice(0, 8)
}

function renderTable (headers, rows, indent = '') {
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map((row) => row[index].length)
  ))
  return [headers, ...rows].map((row) => `${indent}${row
    .map((value, index) => index === row.length - 1 ? value : value.padEnd(widths[index]))
    .join('  ')}`)
}

function childSandboxes (receipt) {
  return (receipt.sandboxTree?.nodes ?? []).filter((node) => node.parentId !== null)
}

function childStatus (child) {
  return child.disposalStatus === 'disposed'
    ? `${child.status} / disposed`
    : child.status ?? 'unknown'
}

function amountOrUnknown (value, formatter) {
  return value === null || value === undefined ? 'unknown' : formatter(value)
}

export function renderSessionSummary (receipt) {
  const lines = [
    'Session complete',
    '',
    `Budget      ${formatUsdtBaseUnits(receipt.initialUsdtBudgetBaseUnits)}`,
    `Spent       ${formatUsdtBaseUnits(receipt.totalUsdtSpentBaseUnits)}`,
    `Returned    ${formatUsdtBaseUnits(receipt.usdtReturnedToTreasuryBaseUnits)}`
  ]
  if (receipt.activity.length > 0) {
    const rows = receipt.activity.map((activity) => {
      const label = activity.type === 'resource_purchase'
        ? activity.resource
        : shortAddress(activity.recipientAddress)
      return [`-${formatUsdtBaseUnits(activity.amountBaseUnits)}`, label, activity.status]
    })
    lines.push('', 'Activity', ...renderTable(['Amount', 'Resource / recipient', 'Status'], rows, '  '))
  }
  const children = childSandboxes(receipt)
  if (children.length > 0) {
    const rows = children.map((child) => [
      child.name,
      shortAddress(child.address),
      formatUsdtBaseUnits(child.delegatedBudgetBaseUnits),
      formatUsdtBaseUnits(child.usdtReturnedToParentBaseUnits ?? 0),
      childStatus(child)
    ])
    lines.push('', 'Delegated sandboxes',
      ...renderTable(['Child', 'Address', 'Budget', 'Returned', 'Status'], rows, '  '))
  }
  lines.push('')
  lines.push(`Gas back    ${formatEthBaseUnits(receipt.ethReturnedToTreasuryWei)}`)
  lines.push(`Sandbox     ${receipt.sandboxDisposalStatus === 'disposed' ? 'disposed' : receipt.sandboxDisposalStatus}`)
  return lines
}

export function renderSessionDetails (receipt) {
  const lines = [
    `Ration session ${shortSessionId(receipt.sessionId)}`,
    '',
    `Started     ${receipt.startedAt ?? 'unknown'}`,
    `Ended       ${receipt.endedAt ?? 'unknown'}`,
    `Command     ${receipt.childCommand?.executable ?? 'unknown'}`,
    `Status      ${receipt.financialSession?.status ?? receipt.sandboxDisposalStatus ?? 'unknown'}`,
    '',
    'Funds',
    `  Budget       ${amountOrUnknown(receipt.initialUsdtBudgetBaseUnits, formatUsdtBaseUnits)}`,
    `  Spent        ${amountOrUnknown(receipt.totalUsdtSpentBaseUnits, formatUsdtBaseUnits)}`,
    `  Returned     ${amountOrUnknown(receipt.usdtReturnedToTreasuryBaseUnits, formatUsdtBaseUnits)}`,
    `  Gas returned ${amountOrUnknown(receipt.ethReturnedToTreasuryWei, formatEthBaseUnits)}`,
    `  Unrecovered  ${amountOrUnknown(receipt.unrecoveredUsdtBaseUnits, formatUsdtBaseUnits)}`,
    '',
    'Root sandbox',
    `  Address      ${receipt.sandboxAddress ?? 'unknown'}`,
    `  Treasury     ${receipt.treasuryAddress ?? 'unknown'}`,
    `  Disposal     ${receipt.sandboxDisposalStatus ?? 'unknown'}`
  ]

  const children = childSandboxes(receipt)
  if (children.length > 0) {
    lines.push('', 'Delegated sandboxes')
    for (const child of children) {
      lines.push(
        `  ${child.name}`,
        `    Address       ${child.address}`,
        `    Parent        ${child.parentId}`,
        `    Budget        ${formatUsdtBaseUnits(child.delegatedBudgetBaseUnits)}`,
        `    USDT returned ${formatUsdtBaseUnits(child.usdtReturnedToParentBaseUnits ?? 0)}`,
        `    Gas returned  ${formatEthBaseUnits(child.ethReturnedToParentWei ?? 0)}`,
        `    Status        ${childStatus(child)}`
      )
    }
  } else {
    lines.push('', 'Delegated sandboxes', '  None')
  }

  if ((receipt.activity ?? []).length > 0) {
    const rows = receipt.activity.map((activity) => [
      activity.type === 'resource_purchase' ? activity.resource : shortAddress(activity.recipientAddress),
      formatUsdtBaseUnits(activity.amountBaseUnits),
      activity.status
    ])
    lines.push('', 'Activity', ...renderTable(['Resource / recipient', 'Amount', 'Status'], rows, '  '))
  } else {
    lines.push('', 'Activity', '  None')
  }

  const transactions = []
  const addTransaction = (label, transaction) => {
    if (transaction?.transactionHash) {
      transactions.push([label, shortHash(transaction.transactionHash), transaction.status ?? 'unknown'])
    }
  }
  addTransaction('Root gas funding', receipt.fundingTransactions?.eth)
  addTransaction('Root USDT funding', receipt.fundingTransactions?.usdt)
  for (const child of children) {
    addTransaction(`${child.name} gas funding`, child.transactions?.funding?.eth)
    addTransaction(`${child.name} USDT funding`, child.transactions?.funding?.usdt)
    addTransaction(`${child.name} USDT return`, child.transactions?.returns?.usdt)
    for (const transaction of child.transactions?.returns?.eth ?? []) {
      addTransaction(`${child.name} gas return`, transaction)
    }
  }
  addTransaction('Root USDT return', receipt.returnTransactions?.usdt)
  for (const transaction of receipt.returnTransactions?.eth ?? []) {
    addTransaction('Root gas return', transaction)
  }
  if (transactions.length > 0) {
    lines.push('', 'Transactions (abbreviated)',
      ...renderTable(['Purpose', 'Hash', 'Status'], transactions, '  '))
  }

  if ((receipt.cleanup?.errors ?? []).length > 0) {
    lines.push('', 'Cleanup warnings', ...receipt.cleanup.errors.map((error) =>
      `  ${error.stage}: ${error.message}`))
  }
  return lines
}

export function renderHistory (receipts) {
  if (receipts.length === 0) return ['No Ration sessions found.']
  const rows = receipts.map((receipt) => [
    shortSessionId(receipt.sessionId),
    receipt.startedAt,
    formatUsdtBaseUnits(receipt.totalUsdtSpentBaseUnits),
    receipt.sandboxDisposalStatus,
    receipt.childCommand?.executable ?? 'unknown'
  ])
  return [
    'Recent sessions',
    '',
    ...renderTable(['Session ID', 'Started', 'Spent', 'Status', 'Command'], rows)
  ]
}
