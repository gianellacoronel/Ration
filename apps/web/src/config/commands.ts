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

export const cliCommands = [
  {
    id: "list",
    label: "List",
    command: commands.list,
    output: `SANDBOX       STATUS      BALANCE
sandbox_01    locked      5.00 USDT
sandbox_02    locked      10.00 USDT`,
  },
  {
    id: "balance",
    label: "Balance",
    command: commands.balance(commandVariables.sandbox),
    output: `Sandbox: sandbox_01

Balance: 5.00 USDT
Status:  locked`,
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
Spent: 1.24 USDT
Remaining: 3.76 USDT`,
  },
] as const;

export type CliCommandId = (typeof cliCommands)[number]["id"];
