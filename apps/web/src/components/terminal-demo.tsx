"use client";

import { useEffect, useRef, useState } from "react";
import { Check as CheckIcon, Copy as CopyIcon } from "lucide-react";

import {
  commandVariables,
  terminalCommandOptions,
  type CommandName,
} from "@/config/commands";
import { terminalDemo } from "@/config/terminal-demo";

export type TerminalState =
  | "idle"
  | "typing"
  | "checking"
  | "locking"
  | "unlocking"
  | "running"
  | "completed";

const runStages: Record<Exclude<TerminalState, "idle" | "typing">, number> = {
  checking: 700,
  locking: 600,
  unlocking: 650,
  running: 1300,
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

function VariableCommand({ text }: { text: string }) {
  const variables = [
    terminalDemo.budget,
    terminalDemo.process,
    ...Object.values(commandVariables),
  ];
  const pattern = new RegExp(
    `(${variables.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "g",
  );

  return text.split(pattern).map((part, index) =>
    variables.includes(part as (typeof variables)[number]) ? (
      <span className="font-medium text-ration-orange" key={`${part}-${index}`}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2">
      <CheckIcon className="shrink-0 text-ration-orange" size={14} strokeWidth={2} aria-hidden="true" />
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
    <div className="space-y-4 text-ration-cream/60">
      {reached("checking") && (
        <div>
          <p>Creating in-memory EOA...</p>
          {reached("locking") && (
            <div className="mt-1">
              <Check>ephemeral EOA ready</Check>
              <Check>no seed persisted</Check>
            </div>
          )}
        </div>
      )}

      {reached("locking") && (
        <div>
          <p>Unlocking treasury and quoting...</p>
          {reached("unlocking") && (
            <div className="mt-1">
              <Check>budget {terminalDemo.balance}</Check>
              <Check>gas reserve {terminalDemo.gasReserve}</Check>
            </div>
          )}
        </div>
      )}

      {reached("unlocking") && (
        <div>
          <p>Funding sandbox...</p>
          {reached("running") && (
            <div className="mt-1">
              <Check>treasury locked</Check>
              <Check>budget confirmed</Check>
            </div>
          )}
        </div>
      )}

      {reached("running") && (
        <div>
          <p>
             Starting <span className="text-ration-cream">{terminalDemo.process}</span>...
          </p>
          <div className="mt-1">
            <Check>process started</Check>
          </div>
          {(state === "running" || state === "completed") && (
            <p className="mt-3 text-ration-cream">
              <span className="text-ration-orange">{terminalDemo.process}</span>{" "}
              &gt; {state === "running" && <Cursor />}
            </p>
          )}
        </div>
      )}

      {state === "completed" && (
        <div className="border-t border-ration-cream/15 pt-4">
          <p className="mb-3 font-medium text-ration-cream">Session complete</p>
          <dl className="grid grid-cols-[6.5rem_auto]">
            <dt>Spent</dt>
            <dd className="text-ration-cream">{terminalDemo.spent}</dd>
            <dt>Returned</dt>
            <dd className="text-ration-orange">{terminalDemo.remaining}</dd>
            <dt>Sandbox</dt>
            <dd className="text-ration-cream">{terminalDemo.status}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function CommandOutput({ command, state }: { command: CommandName; state: TerminalState }) {
  if (state === "typing" || state === "idle") return null;

  if (command === "setup") {
    if (state !== "completed") return null;

    return (
      <div className="mt-5 text-ration-cream/60">
        <p className="mb-2 text-ration-cream">Treasury ready</p>
        <dl className="grid grid-cols-[6.5rem_auto]">
          <dt>Account</dt><dd>Sepolia EOA</dd>
          <dt>Storage</dt><dd className="text-ration-orange">WDK CLI</dd>
          <dt>Fund</dt><dd>USDT + ETH</dd>
        </dl>
      </div>
    );
  }

  if (command === "status") {
    if (state !== "completed") return null;

    return (
      <div className="mt-5 text-ration-cream/60">
        <p className="mb-2 text-ration-cream">Ration treasury</p>
        <dl className="grid grid-cols-[6.5rem_auto]">
          <dt>USDT</dt><dd className="text-ration-orange">{terminalDemo.treasuryBalance}</dd>
          <dt>Gas</dt><dd>{terminalDemo.treasuryGas}</dd>
          <dt>Status</dt><dd>locked</dd>
        </dl>
      </div>
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
    <span className="inline-block animate-cursor-blink text-ration-cream" aria-hidden="true">
      ▌
    </span>
  );
}

export function TerminalDemo() {
  const [selectedCommand, setSelectedCommand] = useState<CommandName>("run");
  const [state, setState] = useState<TerminalState>("idle");
  const [typedCommand, setTypedCommand] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<{
    name: CommandName;
    status: "copied" | "failed";
  } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const copyTimeout = useRef<number | null>(null);

  const command = terminalCommandOptions.find(({ name }) => name === selectedCommand)!;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeout.current) window.clearTimeout(copyTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (state !== "typing") return;

    if (typedCommand.length === command.value.length) {
      const timeout = window.setTimeout(() => setState("checking"), 220);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(
      () => setTypedCommand(command.value.slice(0, typedCommand.length + 1)),
      22,
    );
    return () => window.clearTimeout(timeout);
  }, [command.value, state, typedCommand]);

  useEffect(() => {
    if (state === "checking" && selectedCommand !== "run") {
      const timeout = window.setTimeout(() => setState("completed"), 650);
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
    const nextCommand = terminalCommandOptions.find((option) => option.name === name)!;
    setSelectedCommand(name);
    setTypedCommand(reducedMotion ? nextCommand.value : "");
    setState(reducedMotion ? "completed" : "typing");
  }

  async function copy(name: CommandName, value: string) {
    if (copyTimeout.current) window.clearTimeout(copyTimeout.current);

    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyFeedback({ name, status: "copied" });
    } catch {
      setCopyFeedback({ name, status: "failed" });
    }

    copyTimeout.current = window.setTimeout(() => setCopyFeedback(null), 1400);
  }

  const isExecuting = state !== "idle" && state !== "completed";

  return (
    <div className="animate-fade-in overflow-hidden rounded-sm border border-ration-cream/20 bg-terminal [animation-delay:180ms]">
      <div className="flex h-12 items-center justify-between border-b border-ration-cream/15 px-4">
        <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ration-orange uppercase">
          ration@local:~
        </span>
        <span className="flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.1em] text-ration-cream/55 uppercase">
          <span className="size-1.5 bg-ration-orange" aria-hidden="true" />
          {stateLabels[state]}
        </span>
      </div>

      <div className="border-b border-ration-cream/15 px-4 py-4 mobile:px-5">
        <p className="mb-2.5 font-mono text-[0.625rem] font-medium tracking-[0.14em] text-ration-cream/55 uppercase">
          Commands / click to execute
        </p>
        <div className="grid gap-2" aria-label="Demo commands">
          {terminalCommandOptions.map((option) => (
            <div
              className="flex min-w-0 items-stretch rounded-sm border border-ration-cream/15 transition-[border-color,background-color,box-shadow] duration-200 focus-within:border-ration-orange hover:border-ration-orange/70 hover:bg-ration-orange/[0.04] hover:shadow-[0_0_22px_rgba(247,79,6,0.2)]"
              key={option.name}
            >
              <button
                type="button"
                className="min-h-11 min-w-0 flex-1 cursor-pointer overflow-x-auto px-3 py-2.5 text-left font-mono text-[0.6875rem] whitespace-nowrap text-ration-cream/65 outline-none transition-[color,background-color,transform] [-webkit-tap-highlight-color:rgba(247,79,6,0.18)] hover:text-ration-cream active:scale-[0.99] active:bg-ration-orange/15 active:text-ration-cream disabled:cursor-wait disabled:opacity-45 mobile:text-xs"
                disabled={isExecuting}
                onClick={() => execute(option.name)}
                aria-label={`Run ${option.value}`}
              >
                <VariableCommand text={option.display} />
              </button>
              <button
                type="button"
                className="flex min-h-11 w-[4.75rem] shrink-0 cursor-pointer items-center justify-center gap-1.5 border-l border-ration-cream/15 px-2 font-mono text-[0.625rem] text-ration-cream/60 outline-none transition-[color,background-color,transform] [-webkit-tap-highlight-color:rgba(247,79,6,0.18)] hover:bg-ration-orange/[0.08] hover:text-ration-orange focus-visible:text-ration-orange active:scale-[0.97] active:bg-ration-orange/20 active:text-ration-orange"
                onClick={() => copy(option.name, option.value)}
                aria-label={`Copy ${option.value}`}
              >
                {copyFeedback?.name === option.name
                  ? copyFeedback.status === "copied"
                    ? "Copied"
                    : "Try again"
                  : <><CopyIcon size={13} aria-hidden="true" /> Copy</>}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-[22rem] overflow-x-auto p-4 mobile:min-h-[25rem] mobile:p-6 desktop:min-h-[28rem] desktop:p-7 wide:min-h-[20rem] wide:p-6">
        <div
          className="min-w-max font-mono text-[0.75rem] leading-6 mobile:text-[0.8125rem] mobile:leading-7"
          role="log"
          aria-label="Simulated terminal output"
          aria-busy={isExecuting}
        >
          {state === "idle" ? (
            <p className="text-ration-cream/65">
              Select a command to begin <Cursor />
            </p>
          ) : (
            <>
              <p className="whitespace-nowrap text-ration-cream">
                <span className="text-ration-orange">$</span>{" "}
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
      <p className="sr-only" aria-live="polite">
        {copyFeedback?.status === "copied"
          ? "Command copied to clipboard."
          : copyFeedback?.status === "failed"
            ? "The command could not be copied."
            : ""}
      </p>
    </div>
  );
}
