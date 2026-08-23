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
    output: `Treasury ready

Account: standard Sepolia EOA
Store:   encrypted WDK CLI wallet
Fund:    test USDT + Sepolia ETH`,
  },
  {
    id: "status",
    label: "Status",
    command: commands.status,
    output: `Ration treasury

Balance: ${terminalDemo.treasuryBalance}
Status:  locked`,
  },
  {
    id: "run",
    label: "Run",
    command: commands.run(commandVariables.budget, commandVariables.process),
    output: `Budget        ${terminalDemo.balance}
Gas reserve   ${terminalDemo.gasReserve} (infrastructure)

Ephemeral EOA created
Wallet access pending restricted MCP
Process started

...

USDT swept / ETH recovered
Sandbox disposed`,
  },
] as const;

export type CliCommandId = (typeof cliCommands)[number]["id"];
