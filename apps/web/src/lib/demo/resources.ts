import {
  COMPANY_INTEL,
  DEEP_RESEARCH,
  MARKET_SNAPSHOT,
  PREMIUM_DATASET,
} from "@/lib/demo/intel";

export interface DemoResource {
  id: string;
  name: string;
  description: string;
  provides: readonly string[];
  method: "GET";
  path: string;
  priceBaseUnits: bigint;
  payload: object;
}

export const DEMO_RESOURCES = [
  {
    id: "market-snapshot",
    name: "Warehouse automation market snapshot",
    description:
      "A concise view of the market surrounding Northwind Robotics and its competitive position.",
    provides: [
      "2026 market size and 2030 growth estimate",
      "demand drivers",
      "named competitor positioning and pricing models",
      "market-level risks",
    ],
    method: "GET",
    path: "/api/demo/market-snapshot",
    priceBaseUnits: 10000n,
    payload: { snapshot: MARKET_SNAPSHOT },
  },
  {
    id: "company-intel",
    name: "Company intelligence report",
    description:
      "A structured factual profile of Northwind Robotics, its financing, team, staffing, and recent signals.",
    provides: [
      "company profile and business-model summary",
      "funding history and investors",
      "leadership and headcount by function",
      "recent operating and hiring signals",
    ],
    method: "GET",
    path: "/api/demo/company-intel",
    priceBaseUnits: 30000n,
    payload: { intel: COMPANY_INTEL },
  },
  {
    id: "deep-research",
    name: "Northwind deep research",
    description:
      "A detailed commercial and investment-oriented analysis of Northwind Robotics.",
    provides: [
      "investment thesis and product defensibility",
      "customer, retention, and pipeline evidence",
      "revenue, margin, burn, and runway metrics",
      "execution signals, material risks, and diligence questions",
    ],
    method: "GET",
    path: "/api/demo/deep-research",
    priceBaseUnits: 60000n,
    payload: { research: DEEP_RESEARCH },
  },
  {
    id: "premium-dataset",
    name: "Premium warehouse robotics dataset",
    description:
      "Normalized row-level benchmark data for robotics vendors and Northwind deployments.",
    provides: [
      "vendor robot, revenue, growth, margin, and deployment benchmarks",
      "site-level Northwind fleet utilization and uptime records",
      "a deterministic methodology statement",
    ],
    method: "GET",
    path: "/api/demo/premium-dataset",
    priceBaseUnits: 500000n,
    payload: { dataset: PREMIUM_DATASET },
  },
] as const satisfies readonly DemoResource[];

export function getDemoResource(id: string): DemoResource | undefined {
  return DEMO_RESOURCES.find((resource) => resource.id === id);
}
