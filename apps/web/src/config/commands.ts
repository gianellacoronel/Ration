import { terminalDemo } from "@/config/terminal-demo";

export const RATION_INSTALL_COMMAND = "npm install --global ration-ai";

export const commandVariables = {
  budget: "${BUDGET}",
  ttl: "${TTL}",
  process: "${PROCESS}",
} as const;

export const commands = {
  setup: "ration setup",
  status: "ration status",
  run: (budget: string, process: string, ttl?: string) =>
    `ration run --budget ${budget}${ttl ? ` --ttl ${ttl}` : ""} -- ${process}`,
  recover: "ration recover",
  history: "ration history",
} as const;

export type CommandName = "setup" | "status" | "run" | "recover" | "history";

export const terminalCommandOptions = [
  {
    name: "setup",
    display: commands.setup,
    value: commands.setup,
  },
  {
    name: "status",
    display: commands.status,
    value: commands.status,
  },
  {
    name: "run",
    display: commands.run(
      commandVariables.budget,
      commandVariables.process,
      commandVariables.ttl,
    ),
    value: commands.run(terminalDemo.budget, terminalDemo.process, terminalDemo.ttl),
  },
  {
    name: "recover",
    display: commands.recover,
    value: commands.recover,
  },
  {
    name: "history",
    display: commands.history,
    value: commands.history,
  },
] satisfies Array<{ name: CommandName; display: string; value: string }>;

export const cliCommands = [
  {
    id: "setup",
    label: "Setup",
    command: commands.setup,
    copyValue: commands.setup,
    output: `Treasury ready

  Address   0x…
  Account   standard Sepolia EOA
  Status    locked

Fund this same address with both test USD₮ and Sepolia ETH before running a session.`,
  },
  {
    id: "status",
    label: "Status",
    command: commands.status,
    copyValue: commands.status,
    output: `Ration treasury

Address   0x…
USDT      ${terminalDemo.treasuryBalance}
Gas       ${terminalDemo.treasuryGas}
Status    locked`,
  },
  {
    id: "run",
    label: "Run --budget",
    command: commands.run(
      commandVariables.budget,
      commandVariables.process,
      commandVariables.ttl,
    ),
    copyValue: commands.run(terminalDemo.budget, terminalDemo.process, terminalDemo.ttl),
    output: `Sandbox funding

Budget        ${terminalDemo.balance}
Wallet TTL    ${terminalDemo.ttl}
Gas reserve   ${terminalDemo.gasReserve} (infrastructure)

Fund this sandbox? [y/N] y

Ration

Sandbox   0x…
Budget    ${terminalDemo.balance}
Access    Ration MCP

...

Session complete

Returned    unused test USDT
Sandbox     disposed`,
  },
  {
    id: "recover",
    label: "Recover",
    command: commands.recover,
    copyValue: commands.recover,
    output: `Recovering funded session 8f2a1c4d

  [ok] authenticated crash journal
  [ok] session wallet re-derived
  [ok] remaining USDT returned
  [ok] economical ETH returned

Recovery complete. No private key was stored in the journal.`,
  },
  {
    id: "history",
    label: "History",
    command: commands.history,
    copyValue: commands.history,
    output: `Recent sessions

Session ID  Started               Spent       Status     Command
8f2a1c4d    2026-08-23T14:20Z     0.03 USDT   disposed   opencode

Run \`ration history 8f2a1c4d\` for funds, activity, transaction hashes, and cleanup details.`,
  },
] as const;

export type CliCommandId = (typeof cliCommands)[number]["id"];
