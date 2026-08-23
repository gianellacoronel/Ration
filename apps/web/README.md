# @ration/web

Marketing site for Ration, plus a scoped paid-resource demo: one real HTTP
resource that is unlocked by a USDT payment made from a Ration sandbox.

## Paid resource demo

Two endpoints live under `/api/demo`:

- `GET /api/demo/catalog` — free. Returns the available resource, its price,
  the seller address, the network, and the token.
- `GET /api/demo/company-intel` — protected. Costs `0.02` test USDT and
  returns deterministic company-intelligence JSON once a valid payment is
  presented.

### Flow

1. `GET /api/demo/company-intel` returns `402 Payment Required` with
   machine-readable payment requirements (seller, token, amount, network) and
   retry instructions.
2. The agent calls `ration_purchaseResource({ resourceId: "company-intel" })`.
   Ration validates the server's Sepolia test USDT requirements, checks the
   ephemeral sandbox balance, pays `0.02` USDT from that same EOA, and waits for
   confirmation. No recipient, token, amount, network, or transaction details
   are supplied by the agent.
3. Ration retries `GET /api/demo/company-intel` with the confirmed hash in the
   `x-payment-tx-hash` header and returns the unlocked payload to the agent.
4. The server verifies on-chain, independently of anything the client claims,
   that the transaction:
   - succeeded (`status == 0x1`);
   - emitted an ERC-20 `Transfer` log from the official Sepolia test USDT
     contract at `0xd077A400968890Eacc75cdc901F0356c943e4fDb`;
   - sent to the configured seller address;
   - transferred at least `0.02` USDT (6 decimals);
   - has not been redeemed before.
5. On success the resource is returned exactly once per transaction hash.

Redeemed hashes are kept in memory and mirrored to a JSON ledger file so a
server restart cannot resurrect an already-used payment. Failed verification
attempts never burn a hash.

### Configuration

Copy `.env.example` to `.env.local`:

```bash
RATION_DEMO_RPC_URL=...            # required: Sepolia JSON-RPC endpoint
RATION_DEMO_SELLER_ADDRESS=...     # required: payment recipient (demo seller)
RATION_DEMO_USDT_ADDRESS=...       # optional: defaults to official test USDT
RATION_DEMO_CHAIN_ID=11155111      # optional
RATION_DEMO_REDEMPTIONS_PATH=...   # optional: redemption ledger path
```

The seller address is always taken from the environment and must be a
dedicated demo address; it is never derived from Ration or the WDK CLI
treasury (`rationtreasury`).

### Trying it

```bash
npm run dev

curl http://localhost:3000/api/demo/catalog
# → resource, price 0.02 USDT, seller, network sepolia, token USDT

curl -i http://localhost:3000/api/demo/company-intel
# → 402 Payment Required with payment requirements

# Then run `ration run --budget 0.10 -- codex` and ask:
# Check the available paid resources and get the company intelligence report.
# Codex discovers and purchases the resource through the Ration MCP tools.
```

## Getting Started (site)

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see
the result. You can start editing the page by modifying `app/page.tsx`.
