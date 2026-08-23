export const HELP = `Usage: ration <command> [options]

Commands:
  setup                 Create or recover the Ration treasury
  create --budget <n>   Create and fund a disposable sandbox
  run <sandbox> ...     Run a command in a funded sandbox session
  list [--balances]     List the treasury and sandboxes
  help                  Show this help

Getting started:
  ration setup
  ration create --budget 5
  ration run rationa31f --ttl 10 -- claude
  ration list`

export const ADVANCED_HELP = `Advanced commands:
  setup --insecure                        Create the treasury without a passphrase
  fund <sandbox> --amount <n>             Top up a sandbox from the treasury
  unlock <sandbox>                        Open a temporary sandbox session
  address <wallet> --network <network>    Resolve a wallet address`

export const TREASURY_NAME = 'rationtreasury'
export const NETWORK = 'smart-account-sepolia'
export const TOKEN = 'USDT'
export const SESSION_TTL_MINUTES = 5
export const DEBUG_SESSION_TTL_MINUTES = 60
export const MAX_SESSION_TTL_MINUTES = Math.floor(0x7fffffff / 60000)
export const SETUP_REQUIRED = "Ration is not set up yet. Run 'ration setup' first."
