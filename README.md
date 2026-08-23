# Ration

Ration gives an AI command a disposable, budgeted financial sandbox while keeping the human treasury persistent and separate.

```text
Persistent treasury (WDK CLI)
        ↓ exact budget
Ephemeral in-memory WDK ERC-4337 sandbox
        ↓
Restricted WDK MCP (next integration)
        ↓
Agent
        ↓ sweep remainder
        ↓ dispose keys
```

## Wallet Model

- **Treasury:** an official WDK CLI wallet named `rationtreasury`. It is persistent, encrypted, human-owned, and unlocked only for a specific treasury operation.
- **Sandbox:** an official `@tetherto/wdk-wallet-evm-erc-4337` wallet created inside the `ration run` process. It is not registered with the WDK CLI, has no passphrase, and is never written to the WDK wallet catalog.

Ration generates 64 bytes of cryptographically random sandbox seed material in memory. It does not create or display a mnemonic. At session cleanup, Ration calls the documented WDK account and wallet `dispose()` methods, zeroes its mutable seed buffer, and drops its references.

## Requirements

- Node.js 22.18.0 or newer
- npm
- WDK's public Candide Sepolia Paymaster Token configuration

The repository includes an `.nvmrc` matching the Node.js version required by the WDK CLI.

### USD₮ Gas Payments

Ration uses WDK Paymaster Token mode. Candide supplies native gas and charges the sending wallet in test USD₮. Configure the WDK CLI `smart-account-sepolia` network with:

```text
chainId                 11155111
provider                a working Sepolia JSON-RPC URL
bundlerUrl              https://api.candide.dev/public/v3/11155111
paymasterUrl            https://api.candide.dev/public/v3/11155111
paymasterAddress        0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba
safeModulesVersion      0.3.0
paymasterToken.address  0xd077a400968890eacc75cdc901f0356c943e4fdb
transferMaxFee          100000
isSponsored             false (or omitted)
useNativeCoins          false (or omitted)
```

Ration reads this configuration through the official CLI's structured output, validates it, and passes only the documented SDK fields to the ephemeral wallet constructor. The same configuration derives compatible ERC-4337 smart accounts for treasury funding and sandbox operation.

Candide's public endpoint requires no API key but is rate-limited by source IP. Sepolia USD₮ is test-only and has no value.

## Getting Started

```bash
npm install
npm link

ration setup
# Fund the displayed treasury address with test USD₮.

ration run --budget 1 -- claude
```

`ration setup` creates or reuses the persistent WDK CLI treasury. WDK owns the interactive passphrase, encryption, backup, and storage flow. Ration never reads the treasury passphrase or seed.

For throwaway development environments only, `ration setup --insecure` creates the treasury with an empty passphrase.

## Running A Session

```bash
ration run --budget <amount> -- <command> [args...]
```

The normal session lifecycle is:

1. Validate the WDK ERC-4337 Paymaster Token configuration.
2. Create an in-memory ephemeral ERC-4337 sandbox and resolve its smart-account address.
3. Unlock only the persistent treasury through the official WDK CLI.
4. Ask the CLI for a structured funding dry run.
5. Display the budget, estimated network fee, and total treasury requirement.
6. Fail before confirmation or broadcast if the treasury balance cannot cover the total.
7. Fund the ephemeral address after explicit confirmation and lock the treasury.
8. Wait until the exact budget is visible in the SDK sandbox, then launch the command.
9. On child exit or interruption, quote and sweep the spendable USD₮ remainder to the treasury.
10. Wait for the sweep UserOperation to confirm, dispose the SDK account and manager, and zero Ration's seed buffer.

The funding preview is shown as:

```text
Budget       1.00 USDT
Network fee  0.05 USDT
Total        1.05 USDT
```

The treasury must cover `budget + funding fee`. The sandbox also pays its own outgoing and final sweep fees from its budget.

## MCP Status

The lifecycle and ownership boundary are implemented, but the launched command is not yet connected to wallet tools. Until the restricted MCP integration lands, the child cannot transact with the ephemeral wallet.

The intended integration is the official WDK MCP Toolkit configured only from the in-memory sandbox material. It must not connect to the WDK CLI daemon or expose the treasury. Its `close()` lifecycle will be joined to the existing sweep-and-dispose `finally` boundary once the documented toolkit beta is available from the package registry.

## Advanced Debug Wallets

Persistent sandbox commands remain available only as an advanced compatibility/debug flow:

```bash
ration help --advanced
ration create --budget 5
ration list [--balances]
ration fund rationa31f --amount 2
ration unlock rationa31f
ration address rationa31f --network sepolia
```

`ration create` still delegates to `wdk wallet create`, including its passphrase and mnemonic flow. These named wallets are not used by `ration run` and do not define the product architecture.

All advanced treasury funding paths also quote and display budget, network fee, and total before broadcast, and reject insufficient treasury balances early.

## Security Model

- The treasury remains in official WDK CLI encrypted storage.
- Normal sessions never call `wdk wallet create` for a sandbox.
- Sandbox seed bytes, accounts, and wallet managers exist only in the Ration process.
- Sandbox secrets are never printed, passed in the child environment, or persisted by Ration.
- Treasury funding uses the official CLI structured dry-run and transfer commands.
- Sandbox reads, quotes, sweep transfer, confirmation wait, and disposal use documented ERC-4337 SDK APIs.
- Funding is blocked when its quoted fee reaches the configured `0.1 USD₮` safety cap.
- Cleanup runs after normal exit, launch failure, Ctrl+C, and termination signals.
- A failed sweep or disposal makes the session fail rather than claiming successful cleanup.

This project currently targets Sepolia and test USD₮. WDK packages are beta software; use test networks and test amounts.

## Local Development

```bash
npm run ration -- setup
npm run ration -- run --budget 1 -- claude
npm test
```

Run the project-local official WDK CLI directly:

```bash
npm run wdk -- --help
```

## Official Sources

- [WDK documentation](https://docs.wdk.tether.io/)
- [WDK CLI documentation](https://docs.wdk.tether.io/cli/)
- [WDK ERC-4337 usage](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/usage/)
- [WDK ERC-4337 configuration](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/configuration/)
- [WDK ERC-4337 API](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/api-reference/)
- [WDK MCP Toolkit](https://docs.wdk.tether.io/ai/mcp-toolkit/)
- [WDK MCP Toolkit repository](https://github.com/tetherto/wdk-mcp-toolkit)
