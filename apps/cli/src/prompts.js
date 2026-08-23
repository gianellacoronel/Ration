import { createInterface } from 'node:readline/promises'

export async function confirmTransfer (options = {}) {
  const readline = createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout
  })
  try {
    const closed = new Promise((resolve) => readline.once('close', () => resolve(null)))
    readline.once('SIGINT', () => readline.close())
    const answer = await Promise.race([
      readline.question('Fund this sandbox? [y/N] '),
      closed
    ])
    if (typeof answer !== 'string') return false
    return ['y', 'yes'].includes(answer.trim().toLowerCase())
  } finally {
    readline.close()
  }
}
