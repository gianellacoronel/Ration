import { terminalDemo } from "@/config/terminal-demo";

export const commandVariables = {
  budget: "${BUDGET}",
  process: "${PROCESS}",
} as const;

export const commands = {
  setup: "ration setup",
  status: "ration status",
  run: (budget: string, process: string) =>
    `ration run --budget ${budget} -- ${process}`,
  recover: "ration recover",
  history: "ration history",
} as const;

export type CommandName = "setup" | "status" | "run";

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
    display: commands.run(commandVariables.budget, commandVariables.process),
    value: commands.run(terminalDemo.budget, terminalDemo.process),
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
    label: "Run",
    command: commands.run(commandVariables.budget, commandVariables.process),
    copyValue: commands.run(terminalDemo.budget, terminalDemo.process),
    output: `Sandbox funding

Budget        ${terminalDemo.balance}
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
    output: `No funded Ration sessions require recovery.

If a funded crash journal exists, Ration re-derives that session wallet and retries the return path.`,
  },
  {
    id: "history",
    label: "History",
    command: commands.history,
    copyValue: commands.history,
    output: `Recent sessions

Session ID  Started               Spent       Status     Command
8f2a1c4d    2026-08-23T14:20Z     0.03 USDT   disposed   opencode

Local receipts record activity and cleanup outcomes without storing child argument values.`,
  },
] as const;

export type CliCommandId = (typeof cliCommands)[number]["id"];
