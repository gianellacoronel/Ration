import { spawn } from 'node:child_process'

import { CommandLaunchError } from './errors.js'

export const activeChildren = new Set()

function sanitizedEnvironment (environment) {
  const env = { ...environment }
  delete env.WDK_PASSPHRASE
  delete env.WDK_SEED
  delete env.WDK_SEED_COMMAND
  delete env.WDK_SEED_FILE
  return env
}

export function runRequestedCommand (command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const env = sanitizedEnvironment(options.env ?? process.env)

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawnProcess(command, args, { stdio: 'inherit', env })
    } catch (error) {
      reject(new CommandLaunchError(command, error))
      return
    }
    activeChildren.add(child)
    let forceKillTimer

    const onAbort = () => {
      try {
        child.kill(options.signal.reason === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM')
      } catch {}
      if (options.signal.reason !== 'SIGKILL') {
        forceKillTimer = setTimeout(() => {
          if (!activeChildren.has(child)) return
          try { child.kill('SIGKILL') } catch {}
        }, options.signalGraceMs ?? 1000)
        forceKillTimer.unref?.()
      }
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()

    child.once('error', (error) => {
      activeChildren.delete(child)
      clearTimeout(forceKillTimer)
      options.signal?.removeEventListener('abort', onAbort)
      reject(new CommandLaunchError(command, error))
    })
    child.once('close', (code, signal) => {
      activeChildren.delete(child)
      clearTimeout(forceKillTimer)
      options.signal?.removeEventListener('abort', onAbort)
      resolve({ code, signal })
    })
  })
}

export function runSubagentCommand (command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const env = sanitizedEnvironment(options.env ?? process.env)
  const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawnProcess(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env })
    } catch (error) {
      reject(new CommandLaunchError(command, error))
      return
    }
    activeChildren.add(child)
    let stdout = ''
    let stderr = ''
    let outputBytes = 0
    let forceKillTimer
    let settled = false

    const collect = (target, chunk) => {
      outputBytes += chunk.length
      if (outputBytes > maxOutputBytes) {
        try { child.kill('SIGKILL') } catch {}
        return target
      }
      return target + chunk.toString('utf8')
    }
    child.stdout?.on('data', (chunk) => { stdout = collect(stdout, chunk) })
    child.stderr?.on('data', (chunk) => { stderr = collect(stderr, chunk) })

    const onAbort = () => {
      try { child.kill(options.signal?.reason === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM') } catch {}
      if (options.signal?.reason !== 'SIGKILL') {
        forceKillTimer = setTimeout(() => {
          if (!activeChildren.has(child)) return
          try { child.kill('SIGKILL') } catch {}
        }, options.signalGraceMs ?? 1000)
        forceKillTimer.unref?.()
      }
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    const cleanup = () => {
      activeChildren.delete(child)
      clearTimeout(forceKillTimer)
      options.signal?.removeEventListener('abort', onAbort)
    }
    child.once('error', (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new CommandLaunchError(command, error))
    })
    child.once('close', (code, signal) => {
      if (settled) return
      settled = true
      cleanup()
      if (outputBytes > maxOutputBytes) {
        reject(new Error(`Subagent output exceeded ${maxOutputBytes} bytes.`))
        return
      }
      resolve({ code, signal, stdout: stdout.trim(), stderr: stderr.trim() })
    })
    if (options.signal?.aborted) onAbort()
  })
}

export function childExitCode (result) {
  if (Number.isInteger(result?.code)) return result.code
  if (result?.signal === 'SIGINT') return 130
  if (result?.signal === 'SIGTERM') return 143
  return 1
}
