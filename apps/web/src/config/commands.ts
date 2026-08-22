export const commands = {
  list: "ration list",

  balance: (sandbox: string) => `ration balance ${sandbox}`,

  run: (sandbox: string, ttl: string, process: string) =>
    `ration run ${sandbox} --ttl ${ttl} -- ${process}`,
} as const;
