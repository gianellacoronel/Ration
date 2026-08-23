export interface CompanyIntel {
  company: {
    name: string;
    legalName: string;
    domain: string;
    hq: string;
    founded: number;
    employees: number;
    industry: string;
    website: string;
  };
  summary: string;
  funding: {
    totalRaisedUsd: string;
    lastRound: {
      type: string;
      amountUsd: string;
      announced: string;
      leadInvestor: string;
    };
    investors: string[];
  };
  leadership: { name: string; role: string }[];
  headcountByFunction: Record<string, number>;
  signals: string[];
  sources: { label: string; url: string }[];
}

/**
 * Deterministic sample intelligence. Every response for a redeemed payment
 * returns exactly this payload; no timestamps, randomness, or external calls.
 */
export const COMPANY_INTEL: CompanyIntel = {
  company: {
    name: "Northwind Robotics",
    legalName: "Northwind Robotics Ltd.",
    domain: "northwindrobotics.example",
    hq: "Rotterdam, Netherlands",
    founded: 2019,
    employees: 214,
    industry: "Warehouse automation",
    website: "https://northwindrobotics.example",
  },
  summary:
    "Northwind Robotics builds autonomous mobile robots for mid-size fulfillment centers. Its flagship AMR platform leases by-the-hour instead of selling hardware, which keeps capital expenditure off customer balance sheets.",
  funding: {
    totalRaisedUsd: "$86,500,000",
    lastRound: {
      type: "Series B",
      amountUsd: "$52,000,000",
      announced: "2025-11-18",
      leadInvestor: "Harborline Ventures",
    },
    investors: [
      "Harborline Ventures",
      "Delta Point Capital",
      "Maasvlakte Industrial Fund",
      "Angel syndicate (ex-OCADO operators)",
    ],
  },
  leadership: [
    { name: "Iris Vandenberg", role: "Co-founder & CEO" },
    { name: "Tomás Ferreira", role: "Co-founder & CTO" },
    { name: "Priya Raghunathan", role: "VP Operations" },
    { name: "Henk Oosterhuis", role: "CFO" },
  ],
  headcountByFunction: {
    engineering: 118,
    operations: 46,
    sales: 27,
    gna: 23,
  },
  signals: [
    "Opened a second assembly line in Rotterdam in Q2 2026.",
    "Posted 14 open engineering roles across perception and fleet software.",
    "Two new EU warehouse pilots announced with retail logistics partners.",
    "CTO scheduled to speak at the European Warehouse Automation Summit.",
  ],
  sources: [
    { label: "Company filings registry (sample)", url: "https://registry.example/northwind" },
    { label: "Funding database entry (sample)", url: "https://funding.example/northwind-series-b" },
    { label: "Careers page snapshot (sample)", url: "https://careers.example/northwind" },
  ],
};

export const MARKET_SNAPSHOT = {
  asOf: "2026-08-15",
  market: "European warehouse automation for mid-size fulfillment centers",
  size: {
    estimated2026Usd: "$4.8B",
    projected2030Usd: "$8.1B",
    cagr2026To2030: "14.0%",
  },
  demandDrivers: [
    "Persistent warehouse labor shortages in Benelux and Germany.",
    "Retailers are shifting automation spend from fixed conveyor systems to modular fleets.",
    "Three-year equipment leases increasingly fit customers' operating-expense budgets.",
  ],
  competitors: [
    { name: "Stackpath Motion", position: "Enterprise fleets", pricingModel: "Hardware sale plus support" },
    { name: "Lattice Automata", position: "Mid-market picking", pricingModel: "Per-robot subscription" },
    { name: "Porter Dynamics", position: "Brownfield retrofits", pricingModel: "Usage-based lease" },
    { name: "Northwind Robotics", position: "Mid-market transport", pricingModel: "Per-hour fleet lease" },
  ],
  marketRisks: [
    "Long customer validation cycles can delay fleet expansion.",
    "Component-price declines may pressure lease rates.",
    "Large warehouse-management vendors are adding native robot orchestration.",
  ],
};

export const DEEP_RESEARCH = {
  asOf: "2026-08-15",
  subject: "Northwind Robotics",
  investmentThesis:
    "Northwind has a credible wedge in brownfield, mid-size European warehouses where modular deployment and usage pricing matter more than maximum fleet scale. Its strongest evidence is expansion inside existing accounts; its main constraint is capital intensity.",
  productAndMoat: {
    deployment: "A typical 20-robot fleet is operational in 19 days, versus a 31-day peer median.",
    software: "The orchestration layer integrates with six common warehouse-management systems and reprioritizes tasks without stopping the fleet.",
    defensibility: [
      "Operational data from 3.2 million paid robot-hours.",
      "Reusable brownfield site maps reduce repeat deployment work.",
      "Fleet contracts include expansion options tied to throughput milestones.",
    ],
  },
  commercialEvidence: {
    activeCustomers: 38,
    paidRobots: 612,
    netRevenueRetention: "137%",
    grossLogoRetention: "92%",
    customerConcentration: "Top five customers represent 41% of annual recurring revenue.",
    pipeline: "Eleven paid pilots could add 286 robots if converted.",
  },
  economics: {
    annualRecurringRevenue: "$24.7M",
    yearOverYearGrowth: "68%",
    fleetGrossMargin: "43%",
    contributionPayback: "22 months",
    cash: "$39.2M",
    estimatedMonthlyBurn: "$1.8M",
    impliedRunway: "21 months",
  },
  executionSignals: [
    "Repeat deployments account for 64% of robots added in the last two quarters.",
    "Mean fleet utilization improved from 61% to 73% over twelve months.",
    "Hardware failure incidents fell 28% after the second-generation drive unit shipped.",
  ],
  materialRisks: [
    "Lease ownership keeps robot manufacturing and working-capital needs on Northwind's balance sheet.",
    "Two logistics groups account for 24% of annual recurring revenue.",
    "The company has not demonstrated positive free cash flow at current fleet scale.",
    "A major warehouse-management vendor could bundle orchestration with its core software.",
  ],
  diligenceQuestions: [
    "How much of reported utilization is contractually billable?",
    "What debt facilities are available to finance fleet growth without equity dilution?",
    "Do pilot conversion rates hold outside Benelux customers?",
    "How portable are site maps when a customer changes warehouse-management systems?",
  ],
};

export const EXTERNAL_ANALYST_NOTES = {
  asOf: "2026-08-18",
  subject: "Northwind Robotics",
  provider: "Meridian Field Research (simulated third-party provider)",
  findings: [
    "Three reference customers said the usage-based lease made initial approval easier than a hardware purchase.",
    "Two customers reported that integration with legacy warehouse-management systems required more services work than the standard deployment plan assumes.",
    "A channel partner estimates that repeat-site deployments need roughly 35% fewer engineering hours than first-site deployments.",
    "Procurement teams viewed Northwind's 99% fleet-uptime service level as competitive, but requested clearer credits for peak-season outages.",
  ],
  analystView:
    "Reference evidence supports the expansion thesis, while integration effort and customer concentration remain the most important diligence gaps.",
  confidence: "medium",
};

export const PREMIUM_DATASET = {
  asOf: "2026-08-15",
  methodology:
    "Normalized sample benchmark records for European warehouse-robotics vendors and deployments. Values are deterministic and intended for this demo only.",
  vendors: [
    { vendor: "Northwind Robotics", paidRobots: 612, arrUsdMillions: 24.7, growthPct: 68, grossMarginPct: 43, deploymentDays: 19 },
    { vendor: "Stackpath Motion", paidRobots: 1840, arrUsdMillions: 91.4, growthPct: 31, grossMarginPct: 51, deploymentDays: 42 },
    { vendor: "Lattice Automata", paidRobots: 790, arrUsdMillions: 32.1, growthPct: 49, grossMarginPct: 47, deploymentDays: 24 },
    { vendor: "Porter Dynamics", paidRobots: 455, arrUsdMillions: 18.9, growthPct: 57, grossMarginPct: 39, deploymentDays: 21 },
  ],
  northwindDeployments: [
    { site: "NL-RTM-04", robots: 48, utilizationPct: 81, uptimePct: 99.2, monthsLive: 28 },
    { site: "DE-DUS-11", robots: 36, utilizationPct: 76, uptimePct: 98.8, monthsLive: 19 },
    { site: "BE-ANR-07", robots: 22, utilizationPct: 69, uptimePct: 98.5, monthsLive: 14 },
    { site: "FR-LIL-03", robots: 30, utilizationPct: 72, uptimePct: 98.9, monthsLive: 11 },
    { site: "NL-TIL-09", robots: 18, utilizationPct: 67, uptimePct: 98.1, monthsLive: 7 },
  ],
};
