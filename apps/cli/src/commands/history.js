import {
  listSessionReceipts,
  readSessionReceipt,
  renderHistory
} from '../session.js'

export async function historyCommand (args, options, output) {
  if (args.length > 2) {
    output.error('Usage: ration history [session-id]')
    return 1
  }

  try {
    if (args.length === 2) {
      const readReceipt = options.readSessionReceipt ?? readSessionReceipt
      const receipt = await readReceipt(args[1], options)
      output.log(JSON.stringify(receipt, null, 2))
      return 0
    }

    const listReceipts = options.listSessionReceipts ?? listSessionReceipts
    const receipts = await listReceipts(options)
    for (const line of renderHistory(receipts)) output.log(line)
    return 0
  } catch (error) {
    if (error?.code === 'ENOENT') {
      output.error(`Session not found: ${args[1]}`)
    } else if (error?.message === 'Invalid session id.') {
      output.error('Invalid session id.')
    } else if (error?.message === 'Ambiguous session id.') {
      output.error('Ambiguous session id. Use the full session id.')
    } else {
      output.error('Could not read Ration session history.')
    }
    return 1
  }
}
