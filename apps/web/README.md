# @ration/web

Marketing site for Ration, plus a small paid-resource marketplace unlocked by
USDT payments made from a Ration sandbox.

## Paid resource demo

Five endpoints live under `/api/demo`:

- `GET /api/demo/catalog` - free. Returns every resource's id, description,
  information coverage, price, path, plus the seller, network, and token.
- `GET /api/demo/market-snapshot` - protected at `0.01` test USDT.
- `GET /api/demo/company-intel` - protected at `0.03` test USDT.
- `GET /api/demo/deep-research` - protected at `0.06` test USDT.
- `GET /api/demo/premium-dataset` - protected at `0.50` test USDT.

Every payload is deterministic. The `premium-dataset` intentionally costs more
than the `0.10 USDT` acceptance sandbox.

### Flow

1. The agent reads `ration_getCatalog` and `ration_getRemainingBalance`.
2. The agent calls `ration_purchaseResource` with a listed resource id and its
   catalog price. Ration requests that fixed resource route and receives `402
   Payment Required` with machine-readable seller, token, amount, network, and
   retry instructions.
3. Ration validates those requirements against the catalog, checks the
   ephemeral sandbox's real USDT balance, pays from that same EOA, and waits for
   confirmation. The agent-supplied amount must exactly match the catalog; no
   recipient, token, network, URL, or transaction details are supplied by the
   agent.
4. Ration retries the selected fixed route with the confirmed hash in the
   `x-payment-tx-hash` header and returns the unlocked payload to the agent.
5. The server verifies on-chain, independently of anything the client claims,
   that the transaction:
   - succeeded (`status == 0x1`);
   - emitted an ERC-20 `Transfer` log from the official Sepolia test USDT
     contract at `0xd077A400968890Eacc75cdc901F0356c943e4fDb`;
   - sent to the configured seller address;
   - transferred at least the selected resource's listed price (6 decimals);
   - has not been redeemed before.
6. On success the resource is returned exactly once per transaction hash.

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
# -> four resources, prices, information coverage, seller, network, and token

curl -i http://localhost:3000/api/demo/company-intel
# → 402 Payment Required with payment requirements

# Then run `ration run --budget 0.10 -- codex` and ask:
# Produce the best company research brief you can with the resources available to you.
# Codex decides how to allocate the disposable balance through Ration MCP.
```

## Getting Started (site)

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see
the result. You can start editing the page by modifying `app/page.tsx`.
