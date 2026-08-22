# Ration

Ration creates, lists, and retrieves receiving addresses for isolated disposable wallets using the official Tether Wallet Development Kit (WDK) CLI.

This product slice only creates and lists wallets and retrieves their addresses. It does not fund them, run agents, send transactions, or implement sandbox policies.

WDK and WDK CLI are currently beta software. `npm audit` reports known vulnerabilities in the CLI's pinned transitive wallet dependencies; keep this scaffold unfunded and update to patched official releases as Tether publishes them.

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

Ration uses the official `wdk wallet list --json` output as its source of truth and shows only wallet names matching its generated naming convention.

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

Without linking the package, run the same flow locally with:

```bash
npm run ration -- create
npm run ration -- list
npm run ration -- unlock <wallet>
npm run ration -- address <wallet> --network sepolia
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

Ration starts the published `@tetherto/wdk-cli` executable as a separate process. Wallet creation inherits the terminal; wallet listing and address lookup capture only WDK's JSON output. Ration does not import WDK wallet internals or implement any wallet, mnemonic, encryption, address derivation, or storage behavior.

## Official Sources

- [WDK documentation](https://docs.wallet.tether.io/)
- [WDK CLI repository](https://github.com/tetherto/wdk-cli)
- [WDK core repository](https://github.com/tetherto/wdk)
- [WDK examples](https://github.com/tetherto/wdk-examples)
- [WDK Agent Skills](https://github.com/tetherto/wdk-agent-skills)
