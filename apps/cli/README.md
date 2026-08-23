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

See the [full documentation](https://github.com/gianellacoronel/Ration#readme)
for wallet requirements, setup, commands, the security model, and recovery.
