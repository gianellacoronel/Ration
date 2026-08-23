import { terminalDemo } from "@/config/terminal-demo";

export const commandVariables = {
  budget: "${BUDGET}",
  process: "${PROCESS}",
} as const;

export const commands = {
  setup: "ration setup",
  run: (budget: string, process: string) =>
    `ration run --budget ${budget} -- ${process}`,
  debug: (budget: string) => `ration create --budget ${budget}`,
} as const;

export type CommandName = "setup" | "run" | "debug";

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
  {
    name: "debug",
    display: commands.debug(commandVariables.budget),
    value: commands.debug(terminalDemo.budget),
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
  {
    id: "debug",
    label: "Debug",
    command: commands.debug(commandVariables.budget),
    output: `Advanced flow only

Creates a persistent WDK CLI wallet.
Not used by ration run.`,
  },
] as const;

export type CliCommandId = (typeof cliCommands)[number]["id"];
