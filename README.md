# Ration

Ration creates disposable, budgeted financial sandboxes for AI agents using the official Tether Wallet Development Kit (WDK) CLI.

Ration establishes two product concepts:

- **Treasury:** the user's persistent wallet. It only funds sandboxes and must never be exposed to an agent.
- **Sandbox:** a temporary Ration wallet with a bounded test USD₮ balance that can be exposed to one command for a finite session.

WDK remains the wallet source of truth. Ration does not implement wallet storage and never captures, parses, logs, or persists a seed phrase or passphrase.

## Requirements

- Node.js 22.18.0 or newer
- npm
- WDK's public Candide Sepolia Paymaster Token configuration

The repository includes an `.nvmrc` matching the Node.js version required by the installed WDK CLI.

### USD₮ Gas Payments

Ration does not sponsor user transactions. It uses WDK's Paymaster Token mode, where Candide supplies native gas and charges the wallet in test USD₮. Configure these fields for WDK's `smart-account-sepolia` network before running `ration setup`:

```text
chainId                11155111
bundlerUrl             https://api.candide.dev/public/v3/11155111
paymasterUrl           https://api.candide.dev/public/v3/11155111
paymasterAddress       0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba
paymasterToken.address 0xd077a400968890eacc75cdc901f0356c943e4fdb
transferMaxFee         100000
isSponsored            false (or omitted)
```

Candide's public endpoint serves both Bundler and Paymaster requests without an API key. It is rate-limited by source IP; private authenticated endpoints are intended for production or higher limits and are not required or bundled by Ration. The pinned WDK CLI preset still uses the deprecated `/public/v3/sepolia` path, so its user-level network config must be updated to the numeric endpoint documented above.

Ration reads the network configuration through WDK's structured CLI output and fails before unlocking a wallet when it is not the documented Paymaster Token configuration. A quoted fee at or above WDK's configured `0.1 USD₮` safety limit is rejected before confirmation or broadcast.

## Getting Started

```bash
npm install
npm link

ration setup
# Fund the displayed treasury address with test USD₮.

ration create --budget 5
ration run rationa31f --ttl 10 -- claude
ration list
```

`ration setup` creates a persistent WDK wallet named `rationtreasury`. WDK owns the complete interactive security flow, including passphrase prompts, seed generation, encryption, display, and storage. Ration inherits the terminal directly and cannot read those secrets.

After WDK creates the treasury, Ration asks WDK to unlock it briefly, resolves its receiving address, and locks it. Running setup again detects and reuses the existing treasury instead of creating a duplicate.

Passphrases are the default. For throwaway environments, `ration setup --insecure` creates the treasury with an empty passphrase and no prompts; anyone with access to that machine can spend its funds.

## Creating Sandboxes

```bash
ration create --budget 5
```

Ration performs the following workflow:

1. Verifies that setup is complete.
2. Briefly unlocks the treasury through WDK and verifies its test USD₮ balance.
3. Creates a collision-checked sandbox with a short name such as `rationa31f`.
4. Briefly unlocks the sandbox through WDK and resolves its receiving address.
5. Runs WDK's structured transfer dry run.
6. Displays the USD₮ gas quote, verifies it is below WDK's safety limit, then asks for explicit confirmation.
7. Broadcasts only after an explicit `y` or `yes`.
8. Locks both the sandbox and treasury before reporting success.

Each sandbox is an independent WDK wallet, so WDK presents its official passphrase and seed backup flow during creation. Ration does not receive either secret.

If confirmation is declined, the newly created sandbox remains empty and locked. Ration does not automatically delete wallets in this iteration.

## Listing

```bash
ration list
```

Default output shows the treasury and sandboxes with their lock status. It never unlocks a wallet and never asks for a passphrase:

```text
Treasury
  Balance   —

Sandboxes

SANDBOX      STATUS
rationa31f   locked
rationc912   locked

Locked wallets hide their balance and address. Run 'ration list --balances' to see them.
```

Balances require an unlocked WDK session, so they are explicit opt-in. `ration list --balances` invokes WDK's official unlock flow for locked Ration wallets, reads their balances, and locks every inspected Ration wallet before returning. It ignores unrelated WDK wallets.

```bash
ration list --balances
```

Use `ration list --verbose` to include receiving addresses (shown only for wallets that are already unlocked).

## Running Commands

```bash
ration run <sandbox> --ttl <minutes> -- <command> [args...]
```

The sandbox must already exist and contain test USD₮. Ration locks every WDK wallet, unlocks only the selected sandbox using WDK's finite TTL, records its opening balance, and launches the command with the terminal attached directly. When the command exits or receives Ctrl+C, Ration attempts to read the closing balance and locks all WDK wallets before printing the session receipt.

The sandbox's funded balance is the financial boundary. This command does not create, fund, sweep, delete, recycle, or apply a separate spending policy to the wallet.

## Advanced Commands

These commands are not needed for the normal setup, create, and list workflow:

```bash
ration fund <sandbox> --amount 2
ration unlock <sandbox>
ration address <wallet> --network sepolia
ration help --advanced
```

`fund` tops up an existing sandbox from `rationtreasury`. It uses the same dry-run, confirmation, and final locking behavior as sandbox creation. Source-wallet selection is intentionally not part of the Ration CLI.

The advanced `unlock` command accepts sandboxes only. Ration never offers a command that leaves the treasury unlocked.

## Security Model

- Wallet creation and unlocking use the official interactive WDK CLI with inherited terminal I/O.
- Ration only parses documented structured JSON from wallet listing, address, balance, lock, dry-run, and transfer commands.
- Ration validates Paymaster Token mode, the public Candide Sepolia endpoint, paymaster, test token, and fee cap before wallet operations that can spend funds.
- Ration never requires or bundles a private Candide API key or sponsorship policy.
- Wallet seeds, passphrases, private keys, and EOA addresses are never captured or stored by Ration.
- The treasury and sandbox are explicitly locked after creation, cancellation, or failure.
- Command sessions start by locking all WDK wallets and finish with the same all-wallet lock operation.
- Interrupt signals stop active WDK children and allow Ration's lock cleanup to finish before exit.
- A lock failure is reported as an error and prevents Ration from claiming successful completion.
- Normal output uses only Ration concepts and receiving addresses.

For the hackathon, Ration uses WDK's Sepolia smart-account implementation and Candide Paymaster Token mode. Each wallet's test USD₮ balance pays its own transaction fees; Ration does not subsidize user gas.

## Scope

This version does not implement MCP access, spending policies, x402, sweeping, disposal, or automatic wallet deletion.

## Local Development

Run without linking:

```bash
npm run ration -- setup
npm run ration -- create --budget 5
npm run ration -- run rationa31f --ttl 10 -- claude
npm run ration -- list
```

Run tests:

```bash
npm test
```

Run the project-local official WDK CLI directly:

```bash
npm run wdk -- --help
```

WDK and WDK CLI are currently beta software. Use test networks and test amounts, and update to patched official releases as Tether publishes them.

## Official Sources

- [WDK documentation](https://docs.wallet.tether.io/)
- [WDK CLI repository](https://github.com/tetherto/wdk-cli)
- [WDK core repository](https://github.com/tetherto/wdk)
- [WDK ERC-4337 configuration](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/configuration/)
- [Candide public endpoints](https://docs.candide.dev/wallet/api/public-endpoints/)
- [Candide supported gas tokens](https://docs.candide.dev/wallet/paymaster/tokens-supported/)
