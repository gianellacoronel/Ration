# Ration

Ration gives an AI command a disposable, budgeted financial sandbox while
keeping the human treasury persistent and separate. It is built with Tether
Wallet Development Kit and currently uses Sepolia testnet USDT.

## Install

Ration requires Node.js 22.18.0 or newer.

```bash
npm install --global ration-ai
```

The package installs the `ration` command:

```bash
ration --help
ration setup
ration status
ration run --budget 0.10 --ttl 15m -- codex
```

The Ration MCP server is session-only. It is available under Codex's
`mcp__ration__` namespace only inside the `codex` process started by
`ration run`; it will not appear in a separately started Codex session or in
the persistent output of `codex mcp list`.

See the [full documentation](https://github.com/gianellacoronel/Ration#readme)
for wallet requirements, setup, commands, the security model, and recovery.
