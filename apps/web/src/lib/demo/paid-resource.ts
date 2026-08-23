import { CATALOG_PATH, USDT_DECIMALS, loadDemoConfig } from "@/lib/demo/config";
import type { DemoPaymentConfig } from "@/lib/demo/config";
import { getRedemptionStore } from "@/lib/demo/redemptions";
import { getDemoResource } from "@/lib/demo/resources";
import type { DemoResource } from "@/lib/demo/resources";
import {
  formatUsdtBaseUnits,
  verifyPaymentTransaction,
} from "@/lib/demo/verification";

const PAYMENT_TX_HEADER = "x-payment-tx-hash";
const TX_QUERY_PARAMS = ["tx", "transactionHash", "txHash"];

function paymentRequirements(config: DemoPaymentConfig, priceBaseUnits: bigint) {
  return {
    scheme: "usdt-transfer",
    network: { name: config.networkName, chainId: config.chainId },
    token: {
      symbol: "USDT",
      address: config.usdtAddress,
      decimals: USDT_DECIMALS,
    },
    payToAddress: config.sellerAddress,
    amount: formatUsdtBaseUnits(priceBaseUnits),
    amountBaseUnits: priceBaseUnits.toString(),
  };
}

function paymentRequiredResponse(
  config: DemoPaymentConfig,
  resource: DemoResource,
  error: { code: string; message: string },
) {
  const amount = formatUsdtBaseUnits(resource.priceBaseUnits);
  return Response.json(
    {
      error,
      paymentRequired: true,
      payment: paymentRequirements(config, resource.priceBaseUnits),
      howToPay: {
        summary: `Pay ${amount} test USDT to ${config.sellerAddress} from the Ration sandbox, then retry this request with the confirmed transaction hash.`,
        sandboxTool: {
          name: "transfer",
          args: {
            chain: "sepolia",
            token: "USDT",
            to: config.sellerAddress,
            amount,
          },
        },
        retry: {
          method: "GET",
          path: resource.path,
          header: PAYMENT_TX_HEADER,
          query: "tx",
          value: "the transaction hash returned by the transfer tool",
        },
      },
      catalog: CATALOG_PATH,
    },
    { status: 402 },
  );
}

export async function getPaidResourceResponse(request: Request, resourceId: string) {
  const resource = getDemoResource(resourceId);
  if (!resource) {
    return Response.json(
      { error: { code: "resource_not_found", message: "The requested resource is not listed." } },
      { status: 404 },
    );
  }

  const loaded = loadDemoConfig();
  if (!loaded.ok) {
    return Response.json(
      { error: { code: "demo_not_configured", message: loaded.error } },
      { status: 503 },
    );
  }
  const { config } = loaded;

  const url = new URL(request.url);
  const txHash =
    request.headers.get(PAYMENT_TX_HEADER)?.trim() ||
    TX_QUERY_PARAMS.map((param) => url.searchParams.get(param)?.trim()).find(Boolean) ||
    "";

  if (!txHash) {
    return paymentRequiredResponse(config, resource, {
      code: "payment_required",
      message:
        "This resource requires a payment. Pay the listed amount in test USDT and retry with the transaction hash.",
    });
  }

  let verification;
  try {
    verification = await verifyPaymentTransaction({
      rpcUrl: config.rpcUrl,
      txHash,
      sellerAddress: config.sellerAddress,
      usdtAddress: config.usdtAddress,
      expectedChainId: config.chainId,
      minimumBaseUnits: resource.priceBaseUnits,
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "payment_verification_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "The payment could not be verified on-chain right now.",
        },
        paymentRequired: true,
        payment: paymentRequirements(config, resource.priceBaseUnits),
      },
      { status: 503 },
    );
  }

  if (!verification.ok) {
    return paymentRequiredResponse(config, resource, {
      code: verification.code,
      message: verification.message,
    });
  }

  // The hash is claimed only after full on-chain verification succeeded, so a
  // failed verification never burns a valid payment.
  if (
    !getRedemptionStore(
      `${config.chainId}:${config.usdtAddress}:${config.sellerAddress}`,
    ).claim(txHash)
  ) {
    return paymentRequiredResponse(config, resource, {
      code: "payment_already_redeemed",
      message:
        "This transaction hash has already been used to unlock a resource. A new payment is required.",
    });
  }

  return Response.json({
    resource: resource.id,
    ...resource.payload(config.attackerAddress),
  });
}
