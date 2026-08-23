import { spawn } from 'node:child_process'

import { CommandLaunchError } from './errors.js'

export const activeChildren = new Set()

export function runRequestedCommand (command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const env = { ...(options.env ?? process.env) }
  delete env.WDK_PASSPHRASE
  delete env.WDK_SEED
  delete env.WDK_SEED_COMMAND
  delete env.WDK_SEED_FILE

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawnProcess(command, args, { stdio: 'inherit', env })
    } catch (error) {
      reject(new CommandLaunchError(command, error))
      return
    }
    activeChildren.add(child)

    child.once('error', (error) => {
      activeChildren.delete(child)
      reject(new CommandLaunchError(command, error))
    })
    child.once('close', (code, signal) => {
      activeChildren.delete(child)
      resolve({ code, signal })
    })
  })
}

export function childExitCode (result) {
  if (Number.isInteger(result?.code)) return result.code
  if (result?.signal === 'SIGINT') return 130
  if (result?.signal === 'SIGTERM') return 143
  return 1
}
