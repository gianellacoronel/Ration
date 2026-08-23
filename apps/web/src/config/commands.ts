import { terminalDemo } from "@/config/terminal-demo";

export const commandVariables = {
  budget: "${BUDGET}",
  process: "${PROCESS}",
} as const;

export const commands = {
  setup: "ration setup",
  run: (budget: string, process: string) =>
    `ration run --budget ${budget} -- ${process}`,
} as const;

export type CommandName = "setup" | "run";

export const terminalCommandOptions = [
  {
    name: "setup",
    display: commands.setup,
    value: commands.setup,
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
    output: `Persistent treasury ready

Owner:  human
Store:  encrypted WDK CLI wallet
Agent:  no access`,
  },
  {
    id: "run",
    label: "Run",
    command: commands.run(commandVariables.budget, commandVariables.process),
    output: `Budget       ${terminalDemo.balance}
Network fee  ${terminalDemo.fee}
Total        ${terminalDemo.total}

Ephemeral sandbox created
Wallet access pending restricted MCP
Process started

...

Remainder swept
Sandbox disposed`,
  },
] as const;

export type CliCommandId = (typeof cliCommands)[number]["id"];
