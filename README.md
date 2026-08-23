# Ration

Ration gives an AI command a disposable, budgeted financial sandbox while keeping the human treasury persistent and separate.

```text
Persistent standard Sepolia EOA (WDK CLI)
        ↓ small ETH gas reserve + exact USDT budget
Ephemeral in-memory standard Sepolia EOA
        ↓
Restricted WDK MCP (next integration)
        ↓
Agent
        ↓ sweep USDT, then recover ETH
        ↓ dispose keys
```

## Wallet Model

- **Treasury:** the official WDK CLI wallet `rationtreasury`, used on the built-in standard `sepolia` network. It is a persistent EOA, encrypted at rest, human-owned, and unlocked only for a treasury operation.
- **Sandbox:** a fresh official `@tetherto/wdk-wallet-evm` EOA created inside each `ration run` process. It has no WDK CLI registration, passphrase, persisted catalog entry, Smart Account, bundler, or paymaster.

Ration generates 64 cryptographically random bytes of sandbox seed material in mutable memory. It does not create or display a mnemonic. Cleanup calls the documented WDK account and wallet `dispose()` methods, zeroes Ration's seed buffer, and drops its references.

## Requirements

- Node.js 22.18.0 or newer
- npm
- The official WDK CLI `sepolia` network configured with a working Sepolia RPC
- Test USDT at `0xd077A400968890Eacc75cdc901F0356c943e4fDb`
- Sepolia ETH for infrastructure gas

The repository includes an `.nvmrc` matching the Node.js version required by the WDK CLI. The WDK CLI already ships the standard `sepolia` network and both Sepolia asset definitions.

## Getting Started

```bash
npm install
npm link

ration setup
# Fund the one displayed EOA address with both test USDT and Sepolia ETH.

ration status
ration run --budget 0.5 -- node -e "console.log('Hello from the sandbox')"
```

`ration setup` creates or reuses the persistent WDK CLI treasury and displays its standard Sepolia EOA address. Fund that same address with test USDT and Sepolia ETH. WDK owns the interactive passphrase, encryption, backup, and storage flow; Ration never reads the treasury passphrase or seed.

For throwaway development environments only, `ration setup --insecure` creates the treasury with an empty passphrase.

## Running A Session

```bash
ration run --budget <amount> -- <command> [args...]
```

The normal session lifecycle is:

1. Validate the official standard Sepolia EVM configuration.
2. Create one in-memory standard WDK EOA.
3. Unlock the persistent treasury and read its USDT and ETH balances.
4. Quote the sandbox's USDT sweep and native ETH return through the official SDK.
5. Add a small buffer and dry-run the treasury's ETH and USDT transfers through the official CLI.
6. Fail before confirmation or broadcast unless the treasury has the exact USDT budget and enough ETH for all session infrastructure.
7. Provision the ephemeral EOA with its small ETH reserve, then transfer the exact requested USDT budget.
8. Lock the treasury and launch the command after both balances are visible in the sandbox.
9. On child exit or interruption, sweep the full remaining USDT balance first.
10. Return any remaining ETH whose value exceeds its native transfer fee.
11. Dispose the SDK account and manager, zero Ration's seed buffer, and drop references.

The confirmation preview keeps budget and infrastructure separate:

```text
Budget        0.50 USDT
Gas reserve   0.000... ETH (infrastructure)
```

The user budget is always USDT. Sepolia ETH is provisioned only for lifecycle gas and is never added to, deducted from, or described as the agent budget.

## MCP Status

The lifecycle and ownership boundary are implemented, but the launched command is not yet connected to wallet tools. Until the restricted MCP integration lands, the child cannot transact with the ephemeral wallet.

The intended integration is the official WDK MCP Toolkit configured only from in-memory sandbox material. It must not connect to the WDK CLI daemon or expose the treasury. Its `close()` lifecycle will join the existing sweep-and-dispose `finally` boundary.

## Security Model

- The treasury remains in official WDK CLI encrypted storage.
- Normal sessions never register a sandbox with the WDK CLI.
- Sandbox seed bytes, account, and manager exist only in the Ration process.
- Sandbox secrets are never printed, passed in the child environment, or persisted by Ration.
- Treasury balance reads, dry runs, and transfers use structured official WDK CLI output.
- Sandbox reads, quotes, transfers, confirmation waits, and disposal use current standard EVM WDK APIs.
- Treasury solvency is checked independently for the exact USDT budget and ETH infrastructure requirement.
- Cleanup runs after normal exit, launch failure, Ctrl+C, and termination signals.
- USDT cleanup is always attempted before ETH recovery, and disposal is attempted even if either sweep fails.
- A failed economical sweep or disposal makes the session fail rather than claiming successful cleanup.

This project targets Sepolia and test USDT. WDK packages are beta software; use test networks and test amounts.

## Local Development

```bash
npm run ration -- setup
npm run ration -- status
npm run ration -- run --budget 0.5 -- node -e "console.log('Hello from the sandbox')"
npm test
```

Run the project-local official WDK CLI directly:

```bash
npm run wdk -- --help
```

## Official Sources

- [WDK documentation](https://docs.wdk.tether.io/)
- [WDK CLI documentation](https://docs.wdk.tether.io/cli/)
- [WDK standard EVM module](https://github.com/tetherto/wdk-wallet-evm)
- [WDK MCP Toolkit](https://docs.wdk.tether.io/ai/mcp-toolkit/)
