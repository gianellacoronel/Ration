const RESET = '\x1b[0m'
const RED = '\x1b[31m'

export function createOutput (rawOutput) {
  const color = !process.env.NO_COLOR && !process.env.RATION_NO_COLOR &&
    rawOutput === console && Boolean(process.stdout?.isTTY)
  return {
    log: (line) => rawOutput.log(line),
    error: (line) => rawOutput.error(color ? `${RED}${line}${RESET}` : line)
  }
}
