"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

import {
  cliCommands,
  commandVariables,
  type CliCommandId,
} from "@/config/commands";

const variables = Object.values(commandVariables);
const variablePattern = new RegExp(
  `(${variables
    .map((variable) => variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
  "g",
);

const commandHighlights: Record<CliCommandId, string> = {
  setup: "Human-owned treasury.",
  status: "Explicit balance.",
  run: "Isolated execution.",
};

function HighlightedCommand({ command }: { command: string }) {
  return command.split(variablePattern).map((part, index) =>
    variables.includes(part as (typeof variables)[number]) ? (
      <span
        key={`${part}-${index}`}
        className="bg-ration-orange/15 px-1 py-0.5 font-semibold text-ration-orange"
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function CliSection() {
  const [activeId, setActiveId] = useState<CliCommandId>("run");
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeCommand = cliCommands.find(({ id }) => id === activeId)!;

  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    };
  }, []);

  function selectCommand(id: CliCommandId) {
    setActiveId(id);
    setCopyFeedback(null);
  }

  function handleTabKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + offset + cliCommands.length) % cliCommands.length;
    const nextCommand = cliCommands[nextIndex];
    selectCommand(nextCommand.id);
    tabRefs.current[nextIndex]?.focus();
  }

  async function copyCommand() {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);

    try {
      await navigator.clipboard.writeText(activeCommand.command);
      setCopyFeedback("copied");
    } catch {
      setCopyFeedback("failed");
    }

    feedbackTimeout.current = setTimeout(() => setCopyFeedback(null), 1800);
  }

  return (
    <section
      id="cli"
      className="overflow-hidden border-b bg-surface px-gutter py-section"
      aria-labelledby="cli-title"
    >
      <div className="mx-auto max-w-content">
        <div className="grid gap-12 desktop:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)] desktop:items-center desktop:gap-16">
          <div>
            <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">
              Interface / Ration CLI
            </p>
            <h2
              id="cli-title"
              className="display-type text-[clamp(3rem,5.5vw,5.25rem)] leading-[0.86] text-foreground"
            >
              <span className="block whitespace-nowrap">Built</span>
              <span className="block whitespace-nowrap">For the</span>
              <span className="block whitespace-nowrap">Terminal.</span>
            </h2>
            <p className="mt-9 border-l-2 border-ration-orange pl-5 font-mono text-sm leading-7 text-muted">
              {Object.entries(commandHighlights).map(([id, label]) => (
                <span
                  key={id}
                  className={`block transition-colors ${
                    activeId === id ? "font-semibold text-ration-orange" : "text-muted"
                  }`}
                >
                  {label}
                </span>
              ))}
            </p>
          </div>

          <div className="min-w-0 overflow-hidden rounded-sm border border-ration-cream/20 bg-terminal desktop:w-full desktop:max-w-[46rem] desktop:justify-self-end">
            <div className="flex h-12 items-center justify-between border-b border-ration-cream/15 px-4 mobile:px-5">
              <span className="flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.14em] text-ration-orange uppercase">
                <Terminal size={16} /> ration / cli
              </span>
              <span className="flex items-center gap-2 font-mono text-[0.5625rem] tracking-[0.12em] text-ration-cream/60 uppercase">
                <span className="size-1.5 bg-ration-orange" aria-hidden="true" />
                Ready
              </span>
            </div>

            <div
              className="overflow-x-auto border-b border-ration-cream/15 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="CLI commands"
            >
              <div className="flex min-w-max px-2 mobile:px-3">
                {cliCommands.map((command, index) => {
                  const active = command.id === activeId;

                  return (
                    <button
                      key={command.id}
                      ref={(element) => {
                        tabRefs.current[index] = element;
                      }}
                      type="button"
                      role="tab"
                      id={`cli-tab-${command.id}`}
                      aria-selected={active}
                      aria-controls="cli-command-panel"
                      tabIndex={active ? 0 : -1}
                      className={`relative min-h-14 cursor-pointer px-5 font-mono text-xs font-semibold tracking-[0.04em] outline-none transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:transition-colors focus-visible:bg-ration-cream/5 ${
                        active
                           ? "text-ration-orange after:bg-ration-orange"
                          : "text-ration-cream/60 after:bg-transparent hover:text-ration-cream/85"
                      }`}
                      onClick={() => selectCommand(command.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, index)}
                    >
                      {command.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              id="cli-command-panel"
              role="tabpanel"
              aria-labelledby={`cli-tab-${activeCommand.id}`}
              className="min-w-0"
            >
              <div className="flex items-center justify-between gap-4 border-b border-ration-cream/15 px-4 py-3 mobile:px-6">
                <span className="font-mono text-[0.5625rem] tracking-[0.15em] text-ration-cream/55 uppercase">
                  Command
                </span>
                <button
                  type="button"
                  onClick={copyCommand}
                  className="flex min-h-11 min-w-[6.75rem] cursor-pointer items-center justify-center gap-2 rounded-sm border border-ration-cream/15 px-3 font-mono text-[0.6875rem] text-ration-cream/65 outline-none transition-colors hover:border-ration-orange hover:text-ration-orange focus-visible:border-ration-orange focus-visible:text-ration-orange"
                  aria-label={`Copy ${activeCommand.command}`}
                >
                  {copyFeedback === "copied" ? <Check size={15} /> : <Copy size={15} />}
                  {copyFeedback === "copied"
                    ? "Copied"
                    : copyFeedback === "failed"
                      ? "Try again"
                      : "Copy"}
                </button>
              </div>

              <div className="min-h-[5rem] border-b border-ration-cream/15 p-4 mobile:p-6">
                <pre className="text-[0.75rem] leading-6 whitespace-pre-wrap text-ration-cream mobile:text-[0.8125rem]">
                  <code>
                    <span className="select-none text-ration-orange" aria-hidden="true">
                      $ {" "}
                    </span>
                    <HighlightedCommand command={activeCommand.command} />
                  </code>
                </pre>
              </div>

              <div className="min-h-[16.5rem] p-4 mobile:min-h-[18.75rem] mobile:p-6">
                <pre
                  key={activeCommand.id}
                  className="animate-fade-in font-mono text-[0.6875rem] leading-6 whitespace-pre-wrap text-ration-cream/58 mobile:text-xs mobile:leading-7"
                >
                  {activeCommand.output}
                </pre>
              </div>
            </div>

            <p className="sr-only" aria-live="polite">
              {copyFeedback === "copied"
                ? `${activeCommand.label} command copied to clipboard.`
                : copyFeedback === "failed"
                  ? "The command could not be copied."
                  : ""}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
