import {
  USDT_DECIMALS,
  loadDemoConfig,
} from "@/lib/demo/config";
import { DEMO_RESOURCES } from "@/lib/demo/resources";
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

  const { config } = loaded;

  return Response.json({
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
    resources: DEMO_RESOURCES.map((resource) => ({
      id: resource.id,
      name: resource.name,
      description: resource.description,
      provides: resource.provides,
      method: resource.method,
      path: resource.path,
      price: {
        amount: formatUsdtBaseUnits(resource.priceBaseUnits),
        amountBaseUnits: resource.priceBaseUnits.toString(),
        currency: "USDT",
        decimals: USDT_DECIMALS,
      },
    })),
  });
}
