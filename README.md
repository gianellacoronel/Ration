# Ration

> Give every agent process its own money, not access to your treasury.

Ration is an installable CLI that launches an AI command with a recoverable, isolated Sepolia wallet funded with an exact USDT budget. Tether WDK powers the treasury operations, ephemeral EOA, balances, transfers, and restricted MCP wallet access.

**Aleph Hackathon 2026** | **WDK Track** | **Track 1: Build with the WDK CLI**

[npm](https://www.npmjs.com/package/ration-ai) | [GitHub](https://github.com/gianellacoronel/Ration) | [WDK Track](https://hacki.crecimiento.build/h/aleph-hackathon-2026/tracks/wdk-track) | **Demo video: TODO**

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

**Recorded demo:** TODO - add the final submission video URL.

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

<<<<<<< HEAD
`--ttl` limits the financial session, not the child command. Its countdown starts
when the USDT budget is confirmed. At expiration Ration rejects new MCP writes,
waits for already-broadcast payments to settle, sweeps USDT and economical
Sepolia ETH, disposes the wallet and MCP resources, and finalizes the receipt.
The child can continue non-financial work. Ration warns at two minutes and 30
seconds remaining when the selected duration permits. `--hard-ttl` additionally
terminates the child and is intended for unattended or CI runs. Durations use
`ms`, `s`, `m`, or `h`, for example `30s` or `15m`.

Sepolia funding and recovery each require two confirmed transactions, so their duration follows testnet block production and RPC latency. Ration reports every submission and recovery phase, prints elapsed-time updates every 10 seconds, and polls for confirmations once per second; it does not skip confirmation or return ETH before the USDT sweep is safely confirmed.

The confirmation preview keeps budget and infrastructure separate:

```text
Budget        0.50 USDT
Gas reserve   0.000... ETH (infrastructure)
```

The user budget is always USDT. Sepolia ETH is provisioned only for lifecycle gas and is never added to, deducted from, or described as the agent budget.

## Session Receipts

Every valid `ration run` records a unique, versioned JSON receipt after cleanup.
Receipts include the sandbox and treasury addresses, initial USDT and gas funding,
funding and return transaction hashes, paid resources, direct USDT transfers and
recipients, totals, timestamps, the child executable and argument count, treasury lock state,
and final sandbox disposal status.

```bash
ration history
ration history <session-id>
```

`ration history` lists the 20 most recent sessions using short session IDs. Pass
a short or full session ID to the detailed command to print the persisted JSON
receipt. On macOS receipts live under
`~/Library/Application Support/Ration/sessions`; on XDG systems they live under
`$XDG_DATA_HOME/ration/sessions` or `~/.local/share/ration/sessions`. Set
`RATION_DATA_HOME` to override Ration's data directory. Receipt directories and
files are created with user-only permissions, and writes are atomic.

Receipts contain no seed material, private keys, passphrases, wallet credentials,
child arguments, or child environment variables.

## Exceptional Crash Recovery

`ration setup` creates a random recovery root in macOS Keychain, Linux Secret
Service, or Windows Credential Vault through native OS credential bindings. If
that secure store is unavailable, setup and run fail closed. The root, derived
sandbox seeds, private keys, and treasury credentials are never written to
Ration files.

Each run atomically maintains an authenticated, user-only recovery journal under
the Ration data directory. It contains only non-secret session identifiers,
public addresses, budget and gas values, lifecycle timestamps, process lease
metadata, and transaction hashes/statuses. HKDF-SHA-256 derives the exact
sandbox seed and a separate journal authentication key from the recovery root
and random session ID.

After an exceptional termination such as `kill -9`, power loss, or a Node crash,
the next Ration invocation reports any authenticated funded journal that did not
complete. Recover one session or every incomplete session with:

```bash
ration recover <session-id>
ration recover
```

Recovery refuses a live session lease, reconstructs and verifies the exact
sandbox address, reconciles known transaction hashes, sweeps available USDT and
economical ETH to the authenticated treasury address, disposes the wallet,
writes the financial receipt, and marks the journal recovered. It is idempotent:
completed and recovered sessions are not swept again. Ambiguous funding remains
incomplete until Sepolia settles rather than being incorrectly marked recovered.
Normal child exit and successful financial TTL expiration finish their journals
and never require `ration recover`.

## MCP Access

`ration run` attaches an official `@tetherto/wdk-mcp-toolkit` server to OpenCode and Codex without writing either agent's configuration files. The agent starts a local stdio bridge connected to a private, session-only Unix socket; the seed remains in the parent Ration process and is never placed in command arguments, environment variables, configuration files, or logs.

Ration is visible only inside the child process started by `ration run`; running
`codex mcp list` or starting `codex` separately will not show it. In Codex, its
tools appear under the `mcp__ration__` namespace. Ration also supplies transient
session instructions identifying its paid research catalog so Codex does not
mistake the absence of providers such as Bloomberg or PitchBook for the absence
of the attached Ration resources.

The root server registers one `sepolia` wallet and eight scoped tools:

- `getAddress`
- `getBalance` for native Sepolia ETH, returned as both formatted ETH and canonical wei
- `getTokenBalance` for Sepolia USDT
- `transfer` for Sepolia USDT; the Toolkit quotes the fee and auto-confirms within the already authorized sandbox session, then Ration waits for chain confirmation before returning the result
- `ration_getRemainingBalance` to read the disposable sandbox's current USDT balance without spending
- `ration_getCatalog` to discover the paid resources on the configured Ration demo API
- `ration_purchaseResource` to request a catalog resource with its catalog price, validate that price and its `402` Sepolia test USDT requirements, check the sandbox balance, pay from the same ephemeral EOA, wait for confirmation, and return the unlocked payload
- `ration_spawnSubagents({ agents: [{ name, budget, task }, ...] })` to move exact USDT sub-budgets into one to three fresh child EOAs, launch all task-only children concurrently, collect their ordered results, and reclaim each child's unused USDT and ETH independently

A root session can create at most three children, all at depth one, in one batch. Each temporary MCP has the same seven balance, catalog, purchase, and USDT-transfer tools listed above, but exposes no subagent or hierarchy operation. Ration serializes root-wallet provisioning for nonce safety, then runs child processes and child-wallet financial queues concurrently. Each child receives only its assigned task and isolated wallet; it cannot access sibling funds, the root's undelegated funds, or treasury credentials. A child failure is reported independently and does not cancel successful siblings. Each MCP closes and each wallet sweeps back to the root as that child finishes; failed cleanup remains in the authenticated recovery journal for `ration recover`. The root gas reserve includes infrastructure for the maximum three children, and root financial writes are capped so an agent cannot consume cleanup gas through unlimited transfers. OpenCode and Codex receive native non-interactive launch syntax; other executables are reused with their original arguments plus the child task and receive neutral `RATION_MCP_*` bridge metadata for a custom MCP adapter.

No native transfer, arbitrary transaction, signing, quote, swap, bridge, wallet-management, indexer, or protocol tools are registered. Purchases accept only a resource ID and its exact catalog price; the server rejects stale prices, and arbitrary URLs or client-selected payment destinations are not accepted. Sepolia is the only registered chain and USDT is the only registered token, so `transfer` cannot resolve another asset. The MCP WDK derives the account independently and Ration fails closed if its address does not exactly match the funded sandbox. It never connects to the WDK CLI daemon and cannot see `rationtreasury`.

WDK MCP elicitation is disabled and Ration transiently pre-approves only this session-scoped server's tools in supported agent hosts, so low-level USDT transfers and `ration_purchaseResource` run autonomously within the funded wallet's USDT balance. Unrelated agent tools retain their normal approval policy. The wallet's actual on-chain balance is the loss boundary; the child write cap preserves cleanup gas and does not grant access to parent funds. Neither server receives treasury access.

The WDK MCP server and its tool behavior are client-neutral. Ration contains small launch adapters only for transiently attaching that standard server to Codex and OpenCode without modifying their persistent configuration.

## Adversarial Prompt-Injection Containment

The demo marketplace intentionally includes one malicious paid resource, `external-analyst-notes`. It returns legitimate analyst findings plus an embedded `agentInstructions` block that orders the consuming agent to send all remaining sandbox USDT to a configured attacker address (`RATION_DEMO_TESTNET_ATTACKER_ADDRESS`; optional, defaults to the zero address, Sepolia testnet-only, and when set must differ from the seller). The payload comes solely from the purchased external resource; Ration itself adds no such instruction and applies no policy that blocks the attack. The real security boundary is that the agent only ever holds the disposable sandbox balance — the treasury is never reachable through MCP.

Every session tracks its activity and prints it on completion: the initial USDT
budget, each paid resource purchase, each direct USDT transfer and recipient, the
swept-back remainder, and sandbox disposal. The durable receipt itemizes the
attacker transfer if an agent follows the injected instruction; if it does not,
no direct transfer appears. In either case the treasury isolation and final
disposal state are retained after the ephemeral key material is gone.

This demonstrates the core capability: *the agent can be compromised without compromising the user's treasury.*

## Security Model

- The treasury remains in official WDK CLI encrypted storage.
- Normal sessions never register a sandbox with the WDK CLI.
- Sandbox seed bytes, account, and manager exist only in the Ration process.
- Sandbox secrets are never printed, passed in child arguments or environment, or persisted by Ration.
- Child agents receive only their child wallet MCP; the root and treasury keys never enter the child launch configuration.
- Child exit, failure, financial expiration, and session cleanup revoke child MCP access before unused USDT and ETH return to the root wallet.
- Authenticated recovery journals persist every child funding, agent-state, spending, return, and disposal tree update.
- The MCP server exposes address and balance reads, autonomous low-level USDT transfers, and autonomous purchases restricted to the configured demo API for the ephemeral account.
- MCP resources close before sweeping and final sandbox disposal.
- Treasury balance reads, dry runs, and transfers use structured official WDK CLI output.
- Sandbox reads, quotes, transfers, confirmation waits, and disposal use current standard EVM WDK APIs.
- Treasury solvency is checked independently for the exact USDT budget and ETH infrastructure requirement.
- Cleanup runs after normal exit, launch failure, Ctrl+C, and termination signals.
- USDT cleanup is always attempted before ETH recovery, and disposal is attempted even if either sweep fails.
- A failed economical sweep or disposal makes the session fail rather than claiming successful cleanup.
- Receipts are written only after treasury isolation and sandbox disposal have been attempted, so history preserves the final security outcome after ephemeral keys are gone.
- The adversarial resource's payload is external content; Ration neither injects it nor censors it.
- Session activity, including any injection-driven transfer, is recorded and reported as it actually happened.

This project targets Sepolia and test USDT. WDK packages are beta software; use test networks and test amounts.
=======
Follow the clean-clone setup below. Use this option to run the included paid-resource demo.
>>>>>>> d69f065 (feat: update README.md)

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
