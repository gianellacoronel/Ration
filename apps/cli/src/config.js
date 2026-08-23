export const HELP = `Usage: ration <command> [options]

Commands:
  setup                 Create or recover the Ration treasury
  status                Show the treasury address and balance
  run --budget <n> ...  Run a command in an ephemeral sandbox
  help                  Show this help

Getting started:
  ration setup
  ration run --budget 1 -- claude`

export const TREASURY_NAME = 'rationtreasury'
export const NETWORK = 'sepolia'
export const TOKEN = 'USDT'
export const NATIVE_TOKEN = 'ETH'
export const USDT_ADDRESS = '0xd077A400968890Eacc75cdc901F0356c943e4fDb'
export const SESSION_TTL_MINUTES = 5
export const SETUP_REQUIRED = "Ration is not set up yet. Run 'ration setup' first."
