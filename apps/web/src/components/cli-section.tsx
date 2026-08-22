"use client";

import { useEffect, useRef, useState } from "react";

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

function HighlightedCommand({ command }: { command: string }) {
  return command.split(variablePattern).map((part, index) =>
    variables.includes(part as (typeof variables)[number]) ? (
      <span
        key={`${part}-${index}`}
        className="rounded-[0.2rem] bg-ration-orange/15 px-1 py-0.5 font-semibold text-ration-orange-light"
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function CliSection() {
  const [activeId, setActiveId] = useState<CliCommandId>("list");
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
      className="overflow-hidden border-t border-ration-dark/10 bg-[#eeede8] px-gutter py-section"
      aria-labelledby="cli-title"
    >
      <div className="mx-auto max-w-content">
        <div className="grid gap-12 desktop:grid-cols-[minmax(15rem,0.65fr)_minmax(0,1.35fr)] desktop:items-center desktop:gap-16">
          <div>
            <p className="mb-6 flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.17em] text-ration-orange uppercase mobile:text-xs">
              <span className="h-px w-8 bg-ration-orange" aria-hidden="true" />
              Ration CLI
            </p>
            <h2
              id="cli-title"
              className="max-w-[9ch] text-[clamp(3rem,7vw,6rem)] leading-[0.92] font-semibold tracking-[-0.065em] text-ration-dark"
            >
              Built for the terminal.
            </h2>
            <p className="mt-9 border-l-2 border-ration-orange pl-5 text-[clamp(1.25rem,2.3vw,1.75rem)] leading-[1.35] font-medium tracking-[-0.025em] text-ration-dark/48">
              <span className="block text-ration-dark">Simple commands.</span>
              <span className="block">Explicit money.</span>
              <span className="block">Isolated execution.</span>
            </p>
          </div>

          <div className="min-w-0 overflow-hidden rounded-lg border border-black/15 bg-[#171717] shadow-[0_30px_80px_rgb(28_28_28/0.2)]">
            <div className="flex h-12 items-center justify-between border-b border-white/10 bg-[#202020] px-4 mobile:px-5">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
              </div>
              <span className="font-mono text-[0.625rem] tracking-[0.14em] text-white/35 uppercase">
                ration / cli
              </span>
              <span className="flex items-center gap-2 font-mono text-[0.5625rem] tracking-[0.12em] text-white/40 uppercase">
                <span className="size-1.5 rounded-full bg-[#56e39f]" aria-hidden="true" />
                Ready
              </span>
            </div>

            <div
              className="overflow-x-auto border-b border-white/10 bg-white/[0.025] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                      className={`relative min-h-14 cursor-pointer px-5 font-mono text-xs font-semibold tracking-[0.04em] outline-none transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:transition-colors focus-visible:bg-white/5 ${
                        active
                          ? "text-[#f74f06] after:bg-[#f74f06]"
                          : "text-white/40 after:bg-transparent hover:text-white/75"
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
              <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 mobile:px-6">
                <span className="font-mono text-[0.5625rem] tracking-[0.15em] text-white/30 uppercase">
                  Command
                </span>
                <button
                  type="button"
                  onClick={copyCommand}
                  className="flex min-h-9 min-w-[6.75rem] cursor-pointer items-center justify-center gap-2 rounded-sm border border-white/10 px-3 text-[0.6875rem] font-semibold text-white/55 outline-none transition-[color,background-color,border-color] hover:border-white/20 hover:bg-white/5 hover:text-white focus-visible:border-ration-orange focus-visible:text-white"
                  aria-label={`Copy ${activeCommand.command}`}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="size-3.5"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect x="5.25" y="5.25" width="8" height="8" rx="1.25" stroke="currentColor" />
                    <path d="M10.5 5.25V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5h1.75" stroke="currentColor" />
                  </svg>
                  {copyFeedback === "copied"
                    ? "Copied"
                    : copyFeedback === "failed"
                      ? "Try again"
                      : "Copy"}
                </button>
              </div>

              <div className="overflow-x-auto border-b border-white/10 p-4 mobile:p-6">
                <pre className="min-w-max text-[0.75rem] leading-6 whitespace-pre text-white mobile:text-[0.8125rem]">
                  <code>
                    <span className="select-none text-ration-orange-light" aria-hidden="true">
                      $ {" "}
                    </span>
                    <HighlightedCommand command={activeCommand.command} />
                  </code>
                </pre>
              </div>

              <div className="min-h-[16.5rem] overflow-x-auto p-4 mobile:min-h-[18rem] mobile:p-6">
                <pre
                  key={activeCommand.id}
                  className="min-w-max animate-fade-in font-mono text-[0.6875rem] leading-6 whitespace-pre text-white/58 mobile:text-xs mobile:leading-7"
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
