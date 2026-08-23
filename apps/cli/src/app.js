import { HELP } from './config.js'
import { createOutput } from './output.js'
import { activeChildren } from './processes.js'
import { historyCommand } from './commands/history.js'
import { recoverCommand } from './commands/recover.js'
import { runCommand } from './commands/run.js'
import { setupCommand } from './commands/setup.js'
import { statusCommand } from './commands/status.js'
import { listIncompleteSessionJournals } from './recovery.js'

async function dispatchMain (args, options = {}) {
  const output = createOutput(options.output ?? console)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' ||
    (args[0] === 'help' && args.length === 1)) {
    output.log(HELP)
    return 0
  }
  if (args[0] !== 'recover') {
    try {
      const incomplete = await (options.listIncompleteSessionJournals ?? listIncompleteSessionJournals)(options)
      if (incomplete.invalidCount > 0) {
        output.error(`Warning: ${incomplete.invalidCount} recovery journal${incomplete.invalidCount === 1 ? '' : 's'} failed integrity validation.`)
      }
      if (incomplete.length > 0) {
        output.error(`Recovery required: ${incomplete.length} funded Ration session${incomplete.length === 1 ? '' : 's'} did not finish cleanup.`)
        for (const journal of incomplete) {
          output.error(`  ${journal.sessionId.slice(0, 8)}  ${journal.lifecycle.state}  run 'ration recover ${journal.sessionId.slice(0, 8)}'`)
        }
      }
    } catch {
      output.error('Warning: Ration could not inspect crash-recovery journals.')
    }
  }
  if (args[0] === 'setup' && args.length === 1) return setupCommand(options, output)
  if (args[0] === 'setup' && args.length === 2 && args[1] === '--insecure') {
    return setupCommand(options, output, { insecure: true })
  }
  if (args[0] === 'status') return statusCommand(args, options, output)
  if (args[0] === 'history') return historyCommand(args, options, output)
  if (args[0] === 'recover') return recoverCommand(args, options, output)
  if (args[0] === 'run') return runCommand(args, options, output)

  output.error(`Unknown command: ${args.join(' ')}`)
  output.error("Run 'ration help' for usage.")
  return 1
}

export async function main (args, options = {}) {
  let interrupted
  const abortController = new AbortController()
  const onSignal = (signal) => {
    if (interrupted) return
    interrupted = signal
    abortController.abort(signal)
    const interruptedChildren = [...activeChildren]
    for (const child of interruptedChildren) {
      try {
        if (typeof child.kill === 'function') child.kill(signal)
      } catch {}
    }
    const forceKillTimer = setTimeout(() => {
      for (const child of interruptedChildren) {
        if (!activeChildren.has(child)) continue
        try {
          if (typeof child.kill === 'function') child.kill('SIGKILL')
        } catch {}
      }
    }, options.signalGraceMs ?? 1000)
    forceKillTimer.unref()
  }
  const onSigint = () => onSignal('SIGINT')
  const onSigterm = () => onSignal('SIGTERM')
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)

  let exitCode
  try {
    exitCode = await dispatchMain(args, { ...options, signal: abortController.signal })
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
  if (interrupted === 'SIGINT') return 130
  if (interrupted === 'SIGTERM') return 143
  return exitCode
}
