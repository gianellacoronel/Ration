// keccak256("Transfer(address,address,uint256)")
const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function formatUsdtBaseUnits(amount: bigint): string {
  const integer = amount / 1000000n;
  const fraction = (amount % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : `${integer}`;
}

export type PaymentVerificationCode =
  | "invalid_tx_hash"
  | "tx_not_found"
  | "tx_reverted"
  | "no_usdt_transfer_to_seller"
  | "insufficient_amount";

export type PaymentVerificationResult =
  | { ok: true; paidBaseUnits: bigint }
  | { ok: false; code: PaymentVerificationCode; message: string };

interface RpcLog {
  address?: string;
  topics?: string[];
  data?: string;
}

interface RpcReceipt {
  status?: string;
  logs?: RpcLog[];
}

class JsonRpcError extends Error {}

async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new JsonRpcError(`The Sepolia RPC endpoint did not answer ${method}.`);
  }
  if (!response.ok) {
    throw new JsonRpcError(
      `The Sepolia RPC endpoint returned HTTP ${response.status} for ${method}.`,
    );
  }
  const payload = (await response.json().catch(() => null)) as
    | { result?: T; error?: { message?: string } }
    | null;
  if (!payload || payload.error || payload.result === undefined) {
    throw new JsonRpcError(
      payload?.error?.message ?? `The Sepolia RPC endpoint returned no ${method} result.`,
    );
  }
  return payload.result;
}

function decodeTransferValue(log: RpcLog): bigint | null {
  const topics = log.topics;
  if (!topics || topics.length !== 3 || topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) {
    return null;
  }
  const data = log.data ?? "0x";
  if (!/^0x[0-9a-fA-F]*$/.test(data) || data.length !== 66) return null;
  try {
    return BigInt(data);
  } catch {
    return null;
  }
}

/**
 * Verifies a transaction hash against the chain, never against client-supplied
 * payment details. The transaction must be confirmed, must have moved the
 * official Sepolia test USDT to the configured seller address, and must cover
 * the requested amount.
 */
export async function verifyPaymentTransaction(options: {
  rpcUrl: string;
  txHash: string;
  sellerAddress: string;
  usdtAddress: string;
  expectedChainId: number;
  minimumBaseUnits: bigint;
}): Promise<PaymentVerificationResult> {
  const { rpcUrl, txHash, sellerAddress, usdtAddress, expectedChainId, minimumBaseUnits } = options;

  if (!TX_HASH_PATTERN.test(txHash)) {
    return {
      ok: false,
      code: "invalid_tx_hash",
      message: "The supplied transaction hash is not a valid 32-byte hex hash.",
    };
  }

  const chainIdHex = await rpcCall<string>(rpcUrl, "eth_chainId", []);
  if (Number.parseInt(chainIdHex, 16) !== expectedChainId) {
    throw new JsonRpcError(
      `The configured Sepolia RPC endpoint serves chain id ${Number.parseInt(chainIdHex, 16)}, expected ${expectedChainId}.`,
    );
  }

  const receipt = await rpcCall<RpcReceipt | null>(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) {
    return {
      ok: false,
      code: "tx_not_found",
      message:
        "No confirmed transaction exists for this hash yet. Wait for confirmation and retry.",
    };
  }
  if (receipt.status !== "0x1") {
    return {
      ok: false,
      code: "tx_reverted",
      message: "The referenced transaction did not succeed on-chain.",
    };
  }

  const normalizedSeller = sellerAddress.toLowerCase();
  const normalizedUsdt = usdtAddress.toLowerCase();
  let paidBaseUnits = 0n;
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== normalizedUsdt) continue;
    const value = decodeTransferValue(log);
    if (value === null) continue;
    const recipient = "0x" + (topicsRecipient(log) ?? "");
    if (recipient.toLowerCase() !== normalizedSeller) continue;
    paidBaseUnits += value;
  }

  if (paidBaseUnits === 0n) {
    return {
      ok: false,
      code: "no_usdt_transfer_to_seller",
      message: "The transaction contains no USDT transfer to the seller address.",
    };
  }
  if (paidBaseUnits < minimumBaseUnits) {
    return {
      ok: false,
      code: "insufficient_amount",
      message: `The transaction transferred only ${formatUsdtBaseUnits(paidBaseUnits)} USDT; ${formatUsdtBaseUnits(minimumBaseUnits)} USDT is required.`,
    };
  }

  return { ok: true, paidBaseUnits };
}

function topicsRecipient(log: RpcLog): string | undefined {
  const topic = log.topics?.[2];
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return undefined;
  return topic.slice(-40);
}
