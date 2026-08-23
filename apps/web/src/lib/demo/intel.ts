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
