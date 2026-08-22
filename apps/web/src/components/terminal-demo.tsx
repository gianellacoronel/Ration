"use client";

import { useEffect, useState } from "react";

import { commands } from "@/config/commands";
import { terminalDemo } from "@/config/terminal-demo";

export type TerminalState =
  | "idle"
  | "typing"
  | "checking"
  | "locking"
  | "unlocking"
  | "running"
  | "completed";

type CommandName = "list" | "balance" | "run";

const commandOptions = [
  {
    name: "list",
    display: commands.list,
    value: commands.list,
  },
  {
    name: "balance",
    display: commands.balance("[SANDBOX]"),
    value: commands.balance(terminalDemo.sandbox),
  },
  {
    name: "run",
    display: commands.run("[SANDBOX]", "[TTL]", "[PROCESS]"),
    value: commands.run(
      terminalDemo.sandbox,
      terminalDemo.ttl,
      terminalDemo.process,
    ),
  },
] satisfies Array<{ name: CommandName; display: string; value: string }>;

const runStages: Record<Exclude<TerminalState, "idle" | "typing">, number> = {
  checking: 1500,
  locking: 1300,
  unlocking: 1400,
  running: 2200,
  completed: 0,
};

const stateLabels: Record<TerminalState, string> = {
  idle: "Ready",
  typing: "Typing",
  checking: "Checking",
  locking: "Locking",
  unlocking: "Unlocking",
  running: "Running",
  completed: "Complete",
};

function wait(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

function VariableCommand({ text }: { text: string }) {
  const variables = [
    terminalDemo.sandbox,
    terminalDemo.ttl,
    terminalDemo.process,
    "[SANDBOX]",
    "[TTL]",
    "[PROCESS]",
  ];
  const pattern = new RegExp(
    `(${variables.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "g",
  );

  return text.split(pattern).map((part, index) =>
    variables.includes(part) ? (
      <span className="font-medium text-ration-orange-light" key={`${part}-${index}`}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <p>
      <span className="mr-2 text-[#56e39f]">✓</span>
      {children}
    </p>
  );
}

function RunOutput({ state }: { state: TerminalState }) {
  const reached = (target: TerminalState) => {
    const order: TerminalState[] = [
      "idle",
      "typing",
      "checking",
      "locking",
      "unlocking",
      "running",
      "completed",
    ];
    return order.indexOf(state) >= order.indexOf(target);
  };

  return (
    <div className="space-y-4 text-white/60">
      {reached("checking") && (
        <div>
          <p>Checking sandbox...</p>
          {reached("locking") && (
            <div className="mt-1">
              <Check>sandbox found</Check>
              <Check>balance available</Check>
            </div>
          )}
        </div>
      )}

      {reached("locking") && (
        <div>
          <p>Locking wallets...</p>
          {reached("unlocking") && (
            <div className="mt-1">
              <Check>wallets locked</Check>
            </div>
          )}
        </div>
      )}

      {reached("unlocking") && (
        <div>
          <p>Unlocking sandbox...</p>
          {reached("running") && (
            <div className="mt-1">
              <Check>sandbox unlocked</Check>
            </div>
          )}
        </div>
      )}

      {reached("running") && (
        <div>
          <p>
            Starting <span className="text-white">{terminalDemo.process}</span>...
          </p>
          <div className="mt-1">
            <Check>process started</Check>
          </div>
          {(state === "running" || state === "completed") && (
            <p className="mt-3 text-white">
              <span className="text-ration-orange-light">{terminalDemo.process}</span>{" "}
              &gt; {state === "running" && <Cursor />}
            </p>
          )}
        </div>
      )}

      {state === "completed" && (
        <div className="border-t border-white/10 pt-4">
          <p className="mb-3 font-medium text-white">Session complete</p>
          <dl className="grid grid-cols-[6.5rem_auto]">
            <dt>Spent</dt>
            <dd className="text-white">{terminalDemo.spent}</dd>
            <dt>Remaining</dt>
            <dd className="text-[#56e39f]">{terminalDemo.remaining}</dd>
            <dt>Sandbox</dt>
            <dd className="text-white">locked</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function CommandOutput({ command, state }: { command: CommandName; state: TerminalState }) {
  if (state === "typing" || state === "idle") return null;

  if (command === "list") {
    if (state !== "completed") return null;

    return (
      <div className="mt-5 text-white/60">
        <p className="mb-2 text-white">Sandboxes</p>
        <dl className="grid grid-cols-[6.5rem_auto]">
          <dt>{terminalDemo.sandbox}</dt>
          <dd>
            <span className="text-[#56e39f]">{terminalDemo.initialBalance}</span>
            <span className="ml-3 text-white/40">locked</span>
          </dd>
        </dl>
      </div>
    );
  }

  if (command === "balance") {
    if (state !== "completed") return null;

    return (
      <dl className="mt-5 grid grid-cols-[6.5rem_auto] text-white/60">
        <dt>Sandbox</dt>
        <dd className="text-white">{terminalDemo.sandbox}</dd>
        <dt>Balance</dt>
        <dd className="text-[#56e39f]">{terminalDemo.initialBalance}</dd>
        <dt>Status</dt>
        <dd className="text-white">locked</dd>
      </dl>
    );
  }

  return (
    <div className="mt-5">
      <RunOutput state={state} />
    </div>
  );
}

function Cursor() {
  return (
    <span className="inline-block animate-cursor-blink text-white" aria-hidden="true">
      ▌
    </span>
  );
}

export function TerminalDemo() {
  const [selectedCommand, setSelectedCommand] = useState<CommandName>("run");
  const [state, setState] = useState<TerminalState>("idle");
  const [typedCommand, setTypedCommand] = useState("");
  const [copiedCommand, setCopiedCommand] = useState<CommandName | null>(null);

  const command = commandOptions.find(({ name }) => name === selectedCommand)!;

  useEffect(() => {
    if (state !== "typing") return;

    if (typedCommand.length === command.value.length) {
      const timeout = window.setTimeout(() => setState("checking"), 450);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(
      () => setTypedCommand(command.value.slice(0, typedCommand.length + 1)),
      34,
    );
    return () => window.clearTimeout(timeout);
  }, [command.value, state, typedCommand]);

  useEffect(() => {
    if (state === "checking" && selectedCommand !== "run") {
      const timeout = window.setTimeout(() => setState("completed"), 1100);
      return () => window.clearTimeout(timeout);
    }

    if (
      selectedCommand !== "run" ||
      state === "idle" ||
      state === "typing" ||
      state === "completed"
    ) {
      return;
    }

    const nextState: Partial<Record<TerminalState, TerminalState>> = {
      checking: "locking",
      locking: "unlocking",
      unlocking: "running",
      running: "completed",
    };
    const next = nextState[state];
    if (!next) return;

    const timeout = window.setTimeout(() => setState(next), runStages[state]);
    return () => window.clearTimeout(timeout);
  }, [selectedCommand, state]);

  function execute(name: CommandName) {
    if (state !== "idle" && state !== "completed") return;
    setSelectedCommand(name);
    setTypedCommand("");
    setState("typing");
  }

  async function copy(name: CommandName, value: string) {
    if (!navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedCommand(name);
      await wait(1600);
      setCopiedCommand((current) => (current === name ? null : current));
    } catch {
      setCopiedCommand(null);
    }
  }

  const isExecuting = state !== "idle" && state !== "completed";

  return (
    <div className="animate-fade-in overflow-hidden rounded-lg border border-white/10 bg-ration-dark shadow-[0_28px_70px_rgb(28_28_28/0.24)] [animation-delay:180ms]">
      <div className="flex h-12 items-center justify-between border-b border-white/10 bg-ration-dark-soft px-4">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="font-mono text-[0.6875rem] font-medium tracking-[0.12em] text-white/45 uppercase">
          ration terminal
        </span>
        <span className="flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.1em] text-white/50 uppercase">
          <span className="size-1.5 rounded-full bg-[#56e39f]" aria-hidden="true" />
          {stateLabels[state]}
        </span>
      </div>

      <div className="border-b border-white/10 bg-white/[0.025] px-4 py-4 mobile:px-5">
        <p className="mb-2.5 font-mono text-[0.625rem] font-medium tracking-[0.14em] text-white/35 uppercase">
          Try:
        </p>
        <div className="grid gap-2" aria-label="Demo commands">
          {commandOptions.map((option) => (
            <div
              className="flex min-w-0 items-stretch rounded-sm border border-white/10 bg-white/[0.025] transition-colors focus-within:border-ration-orange-light/60 hover:border-white/20"
              key={option.name}
            >
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer overflow-x-auto px-3 py-2.5 text-left font-mono text-[0.6875rem] whitespace-nowrap text-white/65 outline-none disabled:cursor-wait disabled:opacity-45 mobile:text-xs"
                disabled={isExecuting}
                onClick={() => execute(option.name)}
                aria-label={`Run ${option.value}`}
              >
                <VariableCommand text={option.display} />
              </button>
              <button
                type="button"
                className="w-[4.75rem] shrink-0 cursor-pointer border-l border-white/10 px-2 font-sans text-[0.625rem] font-semibold tracking-[0.05em] text-white/45 outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:text-white"
                onClick={() => copy(option.name, option.value)}
                aria-label={`Copy ${option.value}`}
              >
                {copiedCommand === option.name ? "✓ Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-[25rem] overflow-x-auto p-5 mobile:p-6 desktop:min-h-[28rem] desktop:p-7">
        <div
          className="min-w-max font-mono text-[0.75rem] leading-6 mobile:text-[0.8125rem] mobile:leading-7"
          role="log"
          aria-label="Simulated terminal output"
        >
          {state === "idle" ? (
            <p className="text-white/45">
              Select a command to begin <Cursor />
            </p>
          ) : (
            <>
              <p className="whitespace-nowrap text-white">
                <span className="text-ration-orange-light">$</span>{" "}
                <VariableCommand text={typedCommand} />
                {state === "typing" && <Cursor />}
              </p>
              <CommandOutput command={selectedCommand} state={state} />
            </>
          )}
          <span className="sr-only" aria-live="polite">
            Terminal status: {stateLabels[state]}
          </span>
        </div>
      </div>
    </div>
  );
}
