export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_USDT_ADDRESS =
  "0xd077A400968890Eacc75cdc901F0356c943e4fDb";
export const USDT_DECIMALS = 6;

export const CATALOG_PATH = "/api/demo/catalog";

export interface DemoPaymentConfig {
  rpcUrl: string;
  sellerAddress: string;
  attackerAddress: string;
  usdtAddress: string;
  chainId: number;
  networkName: string;
}

export type DemoConfigResult =
  | { ok: true; config: DemoPaymentConfig }
  | { ok: false; error: string };

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
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
    return { ok: false, error: "RATION_DEMO_SELLER_ADDRESS is not a valid non-zero address." };
  }

  // This address is embedded by the external adversarial resource. It is a
  // Sepolia-only demo sink and is never given access to either Ration wallet.
  const attackerAddress = env.RATION_DEMO_TESTNET_ATTACKER_ADDRESS?.trim() ?? "";
  if (!attackerAddress) {
    return {
      ok: false,
      error:
        "The adversarial demo resource is not configured. Set RATION_DEMO_TESTNET_ATTACKER_ADDRESS to a dedicated Sepolia testnet address.",
    };
  }
  if (!isAddress(attackerAddress)) {
    return {
      ok: false,
      error: "RATION_DEMO_TESTNET_ATTACKER_ADDRESS is not a valid non-zero address.",
    };
  }
  if (attackerAddress.toLowerCase() === sellerAddress.toLowerCase()) {
    return {
      ok: false,
      error: "RATION_DEMO_TESTNET_ATTACKER_ADDRESS must be separate from RATION_DEMO_SELLER_ADDRESS.",
    };
  }

  const usdtAddress = env.RATION_DEMO_USDT_ADDRESS?.trim() || SEPOLIA_USDT_ADDRESS;
  if (!isAddress(usdtAddress)) {
    return { ok: false, error: "RATION_DEMO_USDT_ADDRESS is not a valid address." };
  }
  if (usdtAddress.toLowerCase() !== SEPOLIA_USDT_ADDRESS.toLowerCase()) {
    return { ok: false, error: "RATION_DEMO_USDT_ADDRESS must be the official Sepolia test USDT contract." };
  }

  const chainIdRaw = env.RATION_DEMO_CHAIN_ID?.trim();
  let chainId = SEPOLIA_CHAIN_ID;
  if (chainIdRaw) {
    if (!/^\d+$/.test(chainIdRaw)) {
      return { ok: false, error: "RATION_DEMO_CHAIN_ID must be a decimal integer." };
    }
    chainId = Number(chainIdRaw);
  }
  if (chainId !== SEPOLIA_CHAIN_ID) {
    return { ok: false, error: "RATION_DEMO_CHAIN_ID must be 11155111 (Sepolia)." };
  }

  return {
    ok: true,
    config: {
      rpcUrl,
      sellerAddress: sellerAddress.toLowerCase(),
      attackerAddress: attackerAddress.toLowerCase(),
      usdtAddress: usdtAddress.toLowerCase(),
      chainId,
      networkName: "sepolia",
    },
  };
}
