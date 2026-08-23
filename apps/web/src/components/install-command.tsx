"use client";

import { Check, Copy } from "lucide-react";

import { RATION_INSTALL_COMMAND } from "@/config/commands";
import { useClipboardFeedback } from "@/hooks/use-clipboard-feedback";

export function InstallCommand() {
  const { copy, status } = useClipboardFeedback();

  return (
    <div className="max-w-md overflow-hidden rounded-sm border bg-terminal text-ration-cream shadow-[4px_4px_0_0_var(--color-ration-orange)]">
      <div className="flex min-w-0 items-stretch">
        <pre className="min-w-0 flex-1 overflow-x-auto px-4 py-4 font-mono text-xs leading-5 whitespace-nowrap mobile:text-sm">
          <code>
            <span className="select-none text-ration-orange" aria-hidden="true">$ </span>
            {RATION_INSTALL_COMMAND}
          </code>
        </pre>
        <button
          type="button"
          onClick={() => copy(RATION_INSTALL_COMMAND)}
          className="flex w-12 shrink-0 cursor-pointer items-center justify-center border-l border-ration-cream/15 text-ration-cream/70 outline-none transition-colors hover:bg-ration-orange/10 hover:text-ration-orange focus-visible:bg-ration-orange/10 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ration-orange"
          aria-label={status === "copied" ? "Install command copied" : "Copy install command"}
        >
          {status === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {status === "copied"
          ? "Install command copied to clipboard."
          : status === "failed"
            ? "The install command could not be copied."
            : ""}
      </p>
    </div>
  );
}
