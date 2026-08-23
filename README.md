# Ration

> Give every agent process its own money, not access to your treasury.

Ration is an installable CLI that launches an AI command with a recoverable, isolated Sepolia wallet funded with an exact USDT budget. Tether WDK powers the treasury operations, ephemeral EOA, balances, transfers, and restricted MCP wallet access.

**Aleph Hackathon 2026** | **WDK Track** | **Track 1: Build with the WDK CLI**

[npm](https://www.npmjs.com/package/ration-ai) | [GitHub](https://github.com/gianellacoronel/Ration) | [WDK Track](https://hacki.crecimiento.build/h/aleph-hackathon-2026/tracks/wdk-track)

## The Problem

An agent may need money to complete a task, but giving its process the treasury wallet makes every treasury fund part of the failure boundary. The process needs a limited balance and limited wallet access only for the lifetime of that task.

## The Solution

Ration keeps a human-owned WDK CLI treasury separate and gives each `ration run` a fresh standard EOA with an explicit test-USDT budget and a small ETH gas reserve. The treasury is locked before the command starts; the command receives a restricted MCP wallet, and unused funds are swept back when the command exits or its financial TTL expires.

## How It Works

```text
Human
  |
  | ration run --budget 0.10 --ttl 15m -- codex
  v
Ration CLI
  |-- WDK CLI: unlock treasury, quote + fund sandbox, lock treasury
  |-- WDK EVM: create one recoverable session EOA
  `-- WDK MCP Toolkit: expose scoped wallet and purchase tools
                              |
                              v
                      Codex / OpenCode

Exit or TTL -> revoke financial tools -> sweep USDT, then ETH
            -> dispose WDK resources -> persist receipt
```

The financial TTL can close wallet access without killing the child process. `--hard-ttl` also terminates the child. Authenticated recovery journals let `ration recover` reconstruct and sweep a funded sandbox after an exceptional crash.

## WDK Integration

WDK is in Ration's core execution path. If the official CLI, EVM wallet module, or WDK account cannot be initialized, the session fails before the agent receives wallet access.

| Package | Installed version | Used for |
| --- | --- | --- |
| `@tetherto/wdk` | `1.0.0-beta.16` | Create and dispose session and child WDK instances |
| `@tetherto/wdk-cli` | `1.0.0-beta.3` | Persistent treasury creation, unlock/lock, balances, dry runs, and funding |
| `@tetherto/wdk-wallet-evm` | `1.0.0-beta.17` | Standard Sepolia EOA accounts, quotes, transfers, confirmation waits, and sweeps |
| `@tetherto/wdk-mcp-toolkit` | `1.0.0-beta.1` at `d821898` | Session-only MCP wallet server and base wallet tools |

Exact installed sources are declared in [`apps/cli/package.json`](https://github.com/gianellacoronel/Ration/blob/634bdce45ee0c0eb19cca16fcdc9e82641aa0a9b/apps/cli/package.json#L42-L49).

**Direct source permalinks (audited commit `634bdce`):**

- [WDK CLI process adapter and treasury operations](https://github.com/gianellacoronel/Ration/blob/634bdce45ee0c0eb19cca16fcdc9e82641aa0a9b/apps/cli/src/wdk.js#L18-L257)
- [Ephemeral WDK EOA creation, balances, quotes, sweeps, and disposal](https://github.com/gianellacoronel/Ration/blob/634bdce45ee0c0eb19cca16fcdc9e82641aa0a9b/apps/cli/src/sandbox.js#L41-L259)
- [Treasury checks, funding, lock, TTL, cleanup, and receipts](https://github.com/gianellacoronel/Ration/blob/634bdce45ee0c0eb19cca16fcdc9e82641aa0a9b/apps/cli/src/commands/run.js#L148-L740)
- [Restricted MCP balance, catalog, purchase, and transfer tools](https://github.com/gianellacoronel/Ration/blob/634bdce45ee0c0eb19cca16fcdc9e82641aa0a9b/apps/cli/src/mcp.js#L264-L503)
- [WDK MCP server, wallet, token, and tool registration](https://github.com/gianellacoronel/Ration/blob/634bdce45ee0c0eb19cca16fcdc9e82641aa0a9b/apps/cli/src/mcp.js#L599-L639)
- [Optional child-wallet derivation, funding, recovery, and disposal](https://github.com/gianellacoronel/Ration/blob/634bdce45ee0c0eb19cca16fcdc9e82641aa0a9b/apps/cli/src/sandbox-hierarchy.js#L16-L468)

## Demo

The repository includes a local paid-resource API. The acceptance flow funds a real Sepolia sandbox, lets the agent choose resources that fit its budget, records confirmed test-USDT payments, and returns the remainder:

```bash
ration run --budget 0.10 --ttl 15m -- codex exec \
  "Produce the best company research brief you can with the resources available to you."
```

Unlock the treasury when WDK prompts and approve the funding preview. The final receipt reports the resources or transfers the agent actually selected, the funds returned, and sandbox disposal; the `0.50 USDT` premium resource cannot fit inside this `0.10 USDT` budget.

## Quick Start

### Option A - Install the published CLI

Requires Node.js `>=22.18.0`, a working OS credential store, Sepolia test funds, and an installed, authenticated Codex or OpenCode client.

```bash
npm install --global ration-ai
ration setup
ration status
ration run --budget 0.10 --ttl 15m -- codex
```

`ration setup` creates or reuses the encrypted WDK CLI wallet `rationtreasury`. Fund the address it prints with Sepolia ETH and [Sepolia test USDT](https://github.com/gianellacoronel/Ration/blob/634bdce45ee0c0eb19cca16fcdc9e82641aa0a9b/apps/cli/src/config.js#L15-L20) before running a session. The WDK CLI is bundled with `ration-ai`; no separate global WDK installation is required.

### Option B - Run from source

Follow the clean-clone setup below. Use this option to run the included paid-resource demo.

## Local Development

### Prerequisites

- Node.js `22.19.0` from `.nvmrc` (`22.18.0` is the minimum)
- npm and Git/GitHub access for the Git-hosted MCP Toolkit dependency
- A working OS credential store: macOS Keychain, Linux Secret Service, or Windows Credential Vault
- Codex or OpenCode installed and authenticated
- A dedicated Sepolia seller EOA, Sepolia ETH, and test USDT

### Clean clone

```bash
git clone https://github.com/gianellacoronel/Ration.git
cd Ration
nvm install
nvm use
npm ci
cp apps/web/.env.example apps/web/.env.local
```

Configure `apps/web/.env.local` with the demo submission values. The seller is a dedicated EOA and must never be replaced with the Ration treasury address:

```dotenv
# Sepolia JSON-RPC endpoint used by the demo payment verifier.
RATION_DEMO_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/alch_ftrlU6LX6XIlD2o4C9ujS

# Dedicated EOA that receives demo payments. It is never derived from Ration,
# the WDK CLI, or the rationtreasury wallet.
RATION_DEMO_SELLER_ADDRESS=0x5e47df5E239Fc0585b878692D2e8f6d53455f214
```

Then start the demo API:

```bash
npm run dev
```

Verify the five-resource catalog from another terminal:

```bash
curl http://localhost:3000/api/demo/catalog
```

In a second terminal, inspect the built-in standard Sepolia configuration and set up Ration:

```bash
npm run wdk --workspace ration-ai -- config get --network sepolia --json
npm run ration -- setup
npm run ration -- status
```

If the built-in public provider is unavailable, replace only its provider value:

```bash
npm run wdk --workspace ration-ai -- config set \
  --network sepolia --key provider --value https://YOUR_SEPOLIA_RPC
```

Fund the treasury address shown by setup with Sepolia ETH and test USDT, then run. Ration does not provide a faucet or mint test tokens.

```bash
npm run ration -- run --budget 0.10 --ttl 15m -- codex
```

Setup and treasury unlock are interactive. WDK owns the treasury passphrase, encrypted storage, and backup flow; Ration does not read or persist those credentials. `ration setup --insecure` is available only for throwaway development and creates an empty-passphrase treasury.

### Environment

`apps/web/.env.local` configures the demo API. CLI-only variables must be set in the shell that launches `ration`.

| Variable | Required | Description |
| --- | --- | --- |
| `RATION_DEMO_RPC_URL` | Yes | Sepolia HTTP(S) RPC used by the web API to verify payment receipts |
| `RATION_DEMO_SELLER_ADDRESS` | Yes | Dedicated non-zero EOA that receives demo test-USDT payments; not the treasury |
| `RATION_DEMO_TESTNET_ATTACKER_ADDRESS` | No | Separate Sepolia sink embedded in the adversarial demo resource; defaults to zero address |
| `RATION_DEMO_USDT_ADDRESS` | No | Must remain the built-in Sepolia test-USDT address if set |
| `RATION_DEMO_CHAIN_ID` | No | Must remain `11155111` if set |
| `RATION_DEMO_REDEMPTIONS_PATH` | No | Overrides the demo's local transaction-redemption ledger path |
| `RATION_DEMO_API_URL` | No | CLI demo origin; defaults to `http://localhost:3000` |
| `RATION_DATA_HOME` | No | Overrides the CLI receipt and recovery-journal directory |

Do not place seeds, private keys, or passphrases in these files. Ration removes `WDK_PASSPHRASE`, `WDK_SEED`, `WDK_SEED_COMMAND`, and `WDK_SEED_FILE` before launching the agent.

## Network and Token

| Field | Value |
| --- | --- |
| Environment | Testnet only |
| Network | Ethereum Sepolia |
| Chain ID | `11155111` |
| Budget token | Test USDT, 6 decimals |
| Token contract | [`0xd077A400968890Eacc75cdc901F0356c943e4fDb`](https://sepolia.etherscan.io/address/0xd077A400968890Eacc75cdc901F0356c943e4fDb) |
| Gas token | Sepolia ETH |
| Wallet type | Standard EOA; no smart account, bundler, or paymaster |

> **Security warning:** WDK packages are beta. Use dedicated test wallets with limited testnet funds. Never use a personal wallet or real funds for development.

## Current Scope

The hackathon build implements:

- `setup`, `status`, `run`, `history`, and crash-safe `recover` CLI commands
- One recoverable root sandbox per run and, through MCP, at most one child sandbox
- Exact USDT budgeting, ETH gas provisioning, balance checks, treasury locking, financial TTL, fund recovery, disposal, and receipts
- Restricted MCP access for address/balance reads, USDT transfers, the fixed demo catalog and purchases, and one child delegation
- Native transient MCP launch adapters for Codex and OpenCode
- A local five-resource HTTP `402` demo API with on-chain Sepolia payment verification

This version is Sepolia-only. It does not implement mainnet, gasless/AA wallets, signing, arbitrary transactions, swaps, bridges, lending, fiat flows, or standard x402. Executables other than Codex and OpenCode require their own adapter for the emitted `RATION_MCP_*` bridge metadata.

## Built With

- Node.js ESM CLI
- Tether WDK, WDK CLI, EVM wallet module, and MCP Toolkit
- Model Context Protocol SDK
- Next.js/TypeScript demo API
