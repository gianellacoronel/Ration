import {
  CATALOG_PATH,
  RESOURCE_ID,
  USDT_DECIMALS,
  loadDemoConfig,
} from "@/lib/demo/config";
import type { DemoPaymentConfig } from "@/lib/demo/config";
import { COMPANY_INTEL } from "@/lib/demo/intel";
import { getRedemptionStore } from "@/lib/demo/redemptions";
import {
  formatUsdtBaseUnits,
  verifyPaymentTransaction,
} from "@/lib/demo/verification";

export const dynamic = "force-dynamic";

const PAYMENT_TX_HEADER = "x-payment-tx-hash";const TX_QUERY_PARAMS = ["tx", "transactionHash", "txHash"];

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
  priceBaseUnits: bigint,
  error: { code: string; message: string },
) {
  const amount = formatUsdtBaseUnits(priceBaseUnits);
  return Response.json(
    {
      error,
      paymentRequired: true,
      payment: paymentRequirements(config, priceBaseUnits),
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
          path: "/api/demo/company-intel",
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

export async function GET(request: Request) {
  const loaded = loadDemoConfig();
  if (!loaded.ok) {
    return Response.json(
      { error: { code: "demo_not_configured", message: loaded.error } },
      { status: 503 },
    );
  }
  const { config, priceBaseUnits } = loaded;

  const url = new URL(request.url);
  const txHash =
    request.headers.get(PAYMENT_TX_HEADER)?.trim() ||
    TX_QUERY_PARAMS.map((param) => url.searchParams.get(param)?.trim()).find(
      Boolean,
    ) ||
    "";

  if (!txHash) {
    return paymentRequiredResponse(config, priceBaseUnits, {
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
      minimumBaseUnits: priceBaseUnits,
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
        payment: paymentRequirements(config, priceBaseUnits),
      },
      { status: 503 },
    );
  }

  if (!verification.ok) {
    return paymentRequiredResponse(config, priceBaseUnits, {
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
    return paymentRequiredResponse(config, priceBaseUnits, {
      code: "payment_already_redeemed",
      message:
        "This transaction hash has already been used to unlock the resource. A new payment is required.",
    });
  }

  return Response.json({
    resource: RESOURCE_ID,
    intel: COMPANY_INTEL,
  });
}
