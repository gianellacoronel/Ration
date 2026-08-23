const RESET = '\x1b[0m'
const PALETTE = {
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m'
}

export function createStyle (enabled) {
  const wrap = (code) => (text) => enabled ? `${code}${text}${RESET}` : String(text)
  return {
    bold: wrap(PALETTE.bold),
    dim: wrap(PALETTE.gray),
    cyan: wrap(PALETTE.cyan),
    green: wrap(PALETTE.green),
    red: wrap(PALETTE.red)
  }
}

export function createOutput (rawOutput) {
  const color = !process.env.NO_COLOR && !process.env.RATION_NO_COLOR &&
    rawOutput === console && Boolean(process.stdout?.isTTY)
  const style = createStyle(color)
  return {
    style,
    output: {
      log: (line) => rawOutput.log(line),
      error: (line) => rawOutput.error(color ? style.red(line) : line)
    }
  }
}
