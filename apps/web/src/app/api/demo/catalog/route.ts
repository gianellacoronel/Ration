import {
  RESOURCE_ID,
  RESOURCE_PATH,
  USDT_DECIMALS,
  loadDemoConfig,
} from "@/lib/demo/config";
import { formatUsdtBaseUnits } from "@/lib/demo/verification";

export const dynamic = "force-dynamic";

export async function GET() {
  const loaded = loadDemoConfig();
  if (!loaded.ok) {
    return Response.json(
      { error: { code: "demo_not_configured", message: loaded.error } },
      { status: 503 },
    );
  }

  const { config, priceBaseUnits } = loaded;

  return Response.json({
    resource: {
      id: RESOURCE_ID,
      name: "Company intelligence report",
      description:
        "A structured company-intelligence dossier. Unlocked by paying the listed price in test USDT.",
      method: "GET",
      path: RESOURCE_PATH,
    },
    price: {
      amount: formatUsdtBaseUnits(priceBaseUnits),
      amountBaseUnits: priceBaseUnits.toString(),
      currency: "USDT",
      decimals: USDT_DECIMALS,
    },
    seller: {
      address: config.sellerAddress,
      label: "Ration demo seller",
    },
    network: {
      name: config.networkName,
      chainId: config.chainId,
    },
    token: {
      symbol: "USDT",
      address: config.usdtAddress,
      decimals: USDT_DECIMALS,
    },
  });
}
