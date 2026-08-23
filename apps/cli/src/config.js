export const HELP = `Usage: ration <command> [options]

Commands:
  setup                 Create or recover the Ration treasury
  run --budget <n> ...  Run a command in an ephemeral sandbox
  help                  Show this help

Getting started:
  ration setup
  ration run --budget 1 -- claude`

export const TREASURY_NAME = 'rationtreasury'
export const NETWORK = 'smart-account-sepolia'
export const TOKEN = 'USDT'
export const SESSION_TTL_MINUTES = 5
export const SETUP_REQUIRED = "Ration is not set up yet. Run 'ration setup' first."
