# Ration

Ration is an early scaffold for disposable financial sandboxes for AI agents, built on the official Tether Wallet Development Kit (WDK).

This iteration only verifies that the WDK SDK and WDK CLI are installed and usable. It does not create or fund wallets, run agents, send transactions, or implement sandbox policies.

WDK and WDK CLI are currently beta software. `npm audit` reports known vulnerabilities in the CLI's pinned transitive wallet dependencies; keep this scaffold unfunded and update to patched official releases as Tether publishes them.

## Requirements

- Node.js 22.18.0 or newer
- npm

The repository includes an `.nvmrc` matching the Node.js version used by the current official WDK CLI repository.

## Setup

```bash
npm install
npm run smoke
```

The smoke command performs two non-transactional checks:

1. Generates and validates an in-memory seed with `@tetherto/wdk`, initializes WDK, and disposes it.
2. Runs the official CLI's read-only `wdk network list --json` command.

The generated seed is never printed or persisted.

Run other official CLI commands through the project-local installation:

```bash
npm run wdk -- --help
```

The official Tether WDK Agent Skill is installed for OpenCode under `.agents/skills/wdk` and tracked by `skills-lock.json`. Refresh it with:

```bash
npx skills update wdk --project --yes
```

## Why This Scaffold

Tether currently provides the official `@tetherto/wdk-cli` application and a general Node.js SDK quickstart, but no separate CLI application generator or starter. This project therefore uses the smallest documented Node.js ESM setup and the published CLI directly. `create-wdk-module` is intentionally not used because Ration is not creating a new wallet or protocol module.

## Official Sources

- [WDK documentation](https://docs.wallet.tether.io/)
- [WDK CLI repository](https://github.com/tetherto/wdk-cli)
- [WDK core repository](https://github.com/tetherto/wdk)
- [WDK examples](https://github.com/tetherto/wdk-examples)
- [WDK Agent Skills](https://github.com/tetherto/wdk-agent-skills)
