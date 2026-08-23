import { terminalDemo } from "@/config/terminal-demo";

export const commandVariables = {
  sandbox: "${SANDBOX}",
  ttl: "${TTL}",
  process: "${PROCESS}",
} as const;

export const commands = {
  list: "ration list",

  balance: (sandbox: string) => `ration balance ${sandbox}`,

  run: (sandbox: string, ttl: string, process: string) =>
    `ration run ${sandbox} --ttl ${ttl} -- ${process}`,
} as const;

export type CommandName = "list" | "balance" | "run";

export const terminalCommandOptions = [
  {
    name: "list",
    display: commands.list,
    value: commands.list,
  },
  {
    name: "balance",
    display: commands.balance(commandVariables.sandbox),
    value: commands.balance(terminalDemo.sandbox),
  },
  {
    name: "run",
    display: commands.run(
      commandVariables.sandbox,
      commandVariables.ttl,
      commandVariables.process,
    ),
    value: commands.run(
      terminalDemo.sandbox,
      terminalDemo.ttl,
      terminalDemo.process,
    ),
  },
] satisfies Array<{ name: CommandName; display: string; value: string }>;

export const cliCommands = [
  {
    id: "list",
    label: "List",
    command: commands.list,
    output: `SANDBOX       STATUS      BALANCE
${terminalDemo.sandbox.padEnd(14)}${terminalDemo.status.padEnd(12)}${terminalDemo.balance}`,
  },
  {
    id: "balance",
    label: "Balance",
    command: commands.balance(commandVariables.sandbox),
    output: `Sandbox: ${terminalDemo.sandbox}

Balance: ${terminalDemo.balance}
Status:  ${terminalDemo.status}`,
  },
  {
    id: "run",
    label: "Run",
    command: commands.run(
      commandVariables.sandbox,
      commandVariables.ttl,
      commandVariables.process,
    ),
    output: `Sandbox unlocked
Process started

...

Process exited

Sandbox locked
Spent: ${terminalDemo.spent}
Remaining: ${terminalDemo.remaining}`,
  },
] as const;

export type CliCommandId = (typeof cliCommands)[number]["id"];
