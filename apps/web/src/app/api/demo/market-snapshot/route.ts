import { getPaidResourceResponse } from "@/lib/demo/paid-resource";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return getPaidResourceResponse(request, "market-snapshot");
}
