export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_USDT_ADDRESS =
  "0xd077A400968890Eacc75cdc901F0356c943e4fDb";
export const USDT_DECIMALS = 6;

export const CATALOG_PATH = "/api/demo/catalog";

export interface DemoPaymentConfig {
  rpcUrl: string;
  sellerAddress: string;
  usdtAddress: string;
  chainId: number;
  networkName: string;
}

export type DemoConfigResult =
  | { ok: true; config: DemoPaymentConfig }
  | { ok: false; error: string };

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function loadDemoConfig(
  env: NodeJS.ProcessEnv = process.env,
): DemoConfigResult {
  const rpcUrl = env.RATION_DEMO_RPC_URL?.trim() ?? "";
  if (!rpcUrl) {
    return {
      ok: false,
      error:
        "The demo payment verifier is not configured. Set RATION_DEMO_RPC_URL to a Sepolia RPC endpoint.",
    };
  }
  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    return { ok: false, error: "RATION_DEMO_RPC_URL is not a valid URL." };
  }
  if (parsedRpcUrl.protocol !== "http:" && parsedRpcUrl.protocol !== "https:") {
    return {
      ok: false,
      error: "RATION_DEMO_RPC_URL must be an http or https endpoint.",
    };
  }

  // The seller is always an explicitly configured address. It is never derived
  // from Ration, the WDK CLI, or the `rationtreasury` wallet.
  const sellerAddress = env.RATION_DEMO_SELLER_ADDRESS?.trim() ?? "";
  if (!sellerAddress) {
    return {
      ok: false,
      error:
        "The demo has no configured seller. Set RATION_DEMO_SELLER_ADDRESS to the EOA that must receive USDT payments.",
    };
  }
  if (!isAddress(sellerAddress)) {
    return { ok: false, error: "RATION_DEMO_SELLER_ADDRESS is not a valid address." };
  }

  const usdtAddress = env.RATION_DEMO_USDT_ADDRESS?.trim() || SEPOLIA_USDT_ADDRESS;
  if (!isAddress(usdtAddress)) {
    return { ok: false, error: "RATION_DEMO_USDT_ADDRESS is not a valid address." };
  }

  const chainIdRaw = env.RATION_DEMO_CHAIN_ID?.trim();
  let chainId = SEPOLIA_CHAIN_ID;
  if (chainIdRaw) {
    if (!/^\d+$/.test(chainIdRaw)) {
      return { ok: false, error: "RATION_DEMO_CHAIN_ID must be a decimal integer." };
    }
    chainId = Number(chainIdRaw);
  }

  return {
    ok: true,
    config: {
      rpcUrl,
      sellerAddress: sellerAddress.toLowerCase(),
      usdtAddress: usdtAddress.toLowerCase(),
      chainId,
      networkName: chainId === SEPOLIA_CHAIN_ID ? "sepolia" : `chain ${chainId}`,
    },
  };
}
