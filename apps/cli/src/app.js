import { ADVANCED_HELP, HELP } from './config.js'
import { createOutput } from './output.js'
import { activeChildren } from './processes.js'
import { createCommand } from './commands/create.js'
import { debugAddressCommand, debugUnlockCommand } from './commands/debug.js'
import { fundCommand } from './commands/fund.js'
import { listCommand } from './commands/list.js'
import { runCommand } from './commands/run.js'
import { setupCommand } from './commands/setup.js'

const COMMANDS = new Map([
  ['create', createCommand],
  ['run', runCommand],
  ['list', listCommand],
  ['fund', fundCommand],
  ['unlock', debugUnlockCommand],
  ['address', debugAddressCommand]
])

async function dispatchMain (args, options = {}) {
  const { style, output } = createOutput(options.output ?? console)
  const context = { ...options, style }

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' ||
    (args[0] === 'help' && args.length === 1)) {
    output.log(HELP)
    return 0
  }
  if (args[0] === 'help' && args[1] === '--advanced' && args.length === 2) {
    output.log(ADVANCED_HELP)
    return 0
  }
  if (args[0] === 'setup' && args.length === 1) return setupCommand(context, output)
  if (args[0] === 'setup' && args.length === 2 && args[1] === '--insecure') {
    return setupCommand(context, output, { insecure: true })
  }

  const command = COMMANDS.get(args[0])
  if (command) return command(args, context, output)

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
