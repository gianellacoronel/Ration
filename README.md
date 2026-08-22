# Ration

Ration creates, discovers, resolves, and explicitly funds isolated disposable wallets using the official Tether Wallet Development Kit (WDK) CLI.

The funding slice only moves a user-specified USD₮ amount from an existing unlocked WDK wallet into an existing Ration wallet. It does not create and fund in one command, automate budgets or balances, sweep or delete wallets, run agents, or implement spending policies.

WDK and WDK CLI are currently beta software. `npm audit` reports known vulnerabilities in the CLI's pinned transitive wallet dependencies; use appropriate test networks and amounts, and update to patched official releases as Tether publishes them.

## Requirements

- Node.js 22.18.0 or newer
- npm

The repository includes an `.nvmrc` matching the Node.js version used by the current official WDK CLI repository.

## Setup

```bash
npm install
npm link
ration create
ration list
ration unlock <wallet>
ration address <wallet> --network sepolia
wdk wallet unlock --name <source-wallet>
ration fund <wallet> --from <source-wallet> --amount 10 --network sepolia
```

Ration gives each wallet a unique name such as `ration-20260822T143012123-a1b2c3d4`, then runs the official command:

```bash
wdk wallet create --name <generated-name>
```

WDK owns the complete interactive security flow: passphrase prompts, seed generation and display, encryption, and storage. Ration inherits the terminal directly and never captures, parses, logs, or stores the seed phrase or passphrase.

List the Ration wallets recognized by WDK:

```bash
ration list
```

Ration uses the official `wdk wallet list --json` output as its source of truth and shows only wallets matching its generated naming convention, together with WDK's lock and session state.

Get the receiving address for a listed Ration wallet:

```bash
ration address <wallet> --network sepolia
```

Ration verifies the wallet against WDK's wallet list, then runs `wdk get address --wallet <wallet> --network sepolia --json`. WDK requires the wallet to be unlocked before deriving its address. If needed, unlock it explicitly and retry:

```bash
ration unlock <wallet>
ration address <wallet> --network sepolia
```

`ration unlock` verifies that the wallet belongs to Ration, then runs the official `wdk wallet unlock --name <wallet>` command with an inherited terminal. WDK owns the passphrase prompt and creates a session with its default five-minute TTL.

Fund an existing Ration wallet with the official USD₮ token registered for a network:

```bash
ration unlock <ration-wallet>
wdk wallet unlock --name <source-wallet>
ration fund <ration-wallet> --from <source-wallet> --amount 10 --network sepolia
```

Ration verifies both wallet names through `wdk wallet list --json`, resolves the destination with the existing address flow, and explicitly passes the source wallet to WDK. It first runs:

```bash
wdk send --wallet <source-wallet> --network sepolia --to <resolved-address> --amount 10 --token USDT --dry-run --json
```

Ration displays the structured WDK preview, including fee information, and asks for confirmation. Only an explicit `y` or `yes` runs the same command without `--dry-run`; Ration reports the `txHash` from WDK's structured result. The source wallet must already be unlocked through WDK, and the current WDK address flow also requires the destination Ration wallet to be unlocked. Ration never asks for or captures the source passphrase.

Without linking the package, run the same flow locally with:

```bash
npm run ration -- create
npm run ration -- list
npm run ration -- unlock <wallet>
npm run ration -- address <wallet> --network sepolia
npm run ration -- fund <wallet> --from <source-wallet> --amount 10 --network sepolia
```

Run official WDK CLI commands through the project-local installation:

```bash
npm run wdk -- --help
```

The official Tether WDK Agent Skill is installed for OpenCode under `.agents/skills/wdk` and tracked by `skills-lock.json`. Refresh it with:

```bash
npx skills update wdk --project --yes
```

## Implementation

Ration starts the published `@tetherto/wdk-cli` executable as a separate process. Wallet creation and unlocking inherit the terminal; wallet listing, address lookup, transfer previews, and transfer results use WDK's JSON output and exit codes. Ration does not import WDK wallet internals or implement wallet storage, token contracts, transaction construction, signing, or broadcasting.

## Official Sources

- [WDK documentation](https://docs.wallet.tether.io/)
- [WDK CLI repository](https://github.com/tetherto/wdk-cli)
- [WDK core repository](https://github.com/tetherto/wdk)
- [WDK examples](https://github.com/tetherto/wdk-examples)
- [WDK Agent Skills](https://github.com/tetherto/wdk-agent-skills)
