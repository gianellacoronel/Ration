# Ration

Ration creates disposable, budgeted financial sandboxes for AI agents using the official Tether Wallet Development Kit (WDK) CLI.

This iteration establishes two product concepts:

- **Treasury:** the user's persistent wallet. It only funds sandboxes and must never be exposed to an agent.
- **Sandbox:** a temporary Ration wallet with a bounded test USD₮ balance. Agent execution is not implemented yet.

WDK remains the wallet source of truth. Ration does not implement wallet storage and never captures, parses, logs, or persists a seed phrase or passphrase.

## Requirements

- Node.js 22.18.0 or newer
- npm

The repository includes an `.nvmrc` matching the Node.js version required by the installed WDK CLI.

## Getting Started

```bash
npm install
npm link

ration setup
# Fund the displayed treasury address with test USD₮.

ration create --budget 5
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
6. Displays the budget and estimated fee, then asks for explicit confirmation.
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
- Wallet seeds, passphrases, private keys, and EOA addresses are never captured or stored by Ration.
- The treasury and sandbox are explicitly locked after creation, cancellation, or failure.
- Interrupt signals stop active WDK children and allow Ration's lock cleanup to finish before exit.
- A lock failure is reported as an error and prevents Ration from claiming successful completion.
- Normal output uses only Ration concepts and receiving addresses.

For the hackathon, Ration uses WDK's built-in Sepolia account configuration and registered test USD₮ token. Network adapter, account implementation, and fee-payment details stay behind the product UX.

## Scope

This version does not implement agent execution, MCP access, `ration run`, spending policies, x402, sweeping, disposal, or automatic wallet deletion.

## Local Development

Run without linking:

```bash
npm run ration -- setup
npm run ration -- create --budget 5
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
