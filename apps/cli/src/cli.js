// Stable public facade for the executable and consumers of the CLI package.
export { main } from './app.js'
export * from './errors.js'
export { runRequestedCommand, runSubagentCommand } from './processes.js'
export { confirmTransfer } from './prompts.js'
export {
  acquireSessionLease,
  createSessionJournal,
  ensureRecoveryRoot,
  listIncompleteSessionJournals,
  persistSessionJournal,
  prepareRecoverySession,
  readSessionJournal,
  transitionSessionJournal,
  verifySessionJournal
} from './recovery.js'
export {
  createSessionReceipt,
  finalizeSessionReceipt,
  listSessionReceipts,
  persistSessionReceipt,
  readSessionReceipt,
  renderHistory,
  renderSessionDetails,
  renderSessionSummary,
  resolveRationDataDirectory
} from './session.js'
export {
  createWdkOutputFilter,
  resolveWdkCliPath,
  runWdkGetAddress,
  runWdkGetEthBalance,
  runWdkGetNetworkConfig,
  runWdkGetUsdtBalance,
  runWdkTransfer,
  runWdkWalletCreate,
  runWdkWalletList,
  runWdkWalletLock,
  runWdkWalletUnlock
} from './wdk.js'
