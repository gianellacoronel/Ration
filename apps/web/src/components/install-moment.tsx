"use client";

import { ArrowRight, Check, Copy, Package } from "lucide-react";

import { RATION_INSTALL_COMMAND } from "@/config/commands";
import { useClipboardFeedback } from "@/hooks/use-clipboard-feedback";

const deliveryChain = [
  { label: "Ration", detail: "Product" },
  { label: "CLI", detail: "Tool" },
  { label: "npm", detail: "Published" },
] as const;

export function InstallMoment() {
  const { copy, status } = useClipboardFeedback();

  return (
    <section
      id="install"
      className="overflow-hidden border-b border-ration-dark/30 bg-ration-orange px-gutter py-[clamp(3.5rem,7vw,6rem)] text-ration-dark"
      aria-labelledby="install-title"
    >
      <div className="mx-auto grid max-w-content gap-10 desktop:grid-cols-[0.78fr_1.22fr] desktop:items-end desktop:gap-16">
        <div>
          <p className="mb-5 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
            Published / available on npm
          </p>
          <h2
            id="install-title"
            className="display-type max-w-[10ch] text-[clamp(2.8rem,5.4vw,5.25rem)] leading-[0.85]"
          >
            The idea ships as a command.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-ration-dark/70">
            Ration is a CLI you can install now, not a diagram waiting to become one.
          </p>
        </div>

        <div className="min-w-0">
          <ol className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Ration is a CLI published on npm">
            {deliveryChain.map(({ label, detail }, index) => (
              <li key={label} className="contents">
                <span className="flex items-baseline gap-2 font-mono">
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-[0.55rem] uppercase tracking-[0.14em] text-ration-dark/55">{detail}</span>
                </span>
                {index < deliveryChain.length - 1 && <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />}
              </li>
            ))}
          </ol>

          <div className="overflow-hidden rounded-sm border border-ration-dark bg-terminal text-ration-cream shadow-[7px_7px_0_0_#1c1c1c]">
            <div className="flex h-11 items-center justify-between border-b border-ration-cream/15 px-4">
              <span className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ration-orange">
                <Package size={15} aria-hidden="true" /> npm / registry
              </span>
              <span className="flex items-center gap-2 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-ration-cream/60">
                <span className="size-1.5 bg-ration-orange" aria-hidden="true" /> Published
              </span>
            </div>

            <div className="flex min-w-0 items-stretch">
              <pre className="min-w-0 flex-1 overflow-x-auto px-4 py-5 text-xs leading-6 whitespace-nowrap mobile:px-5 mobile:text-sm">
                <code>
                  <span className="select-none text-ration-orange" aria-hidden="true">$ </span>
                  {RATION_INSTALL_COMMAND}
                </code>
              </pre>
              <button
                type="button"
                onClick={() => copy(RATION_INSTALL_COMMAND)}
                className="flex min-h-14 w-24 shrink-0 cursor-pointer items-center justify-center gap-2 border-l border-ration-cream/15 px-3 font-mono text-[0.6875rem] text-ration-cream/70 outline-none transition-colors hover:bg-ration-orange/10 hover:text-ration-orange focus-visible:bg-ration-orange/10 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ration-orange"
                aria-label={status === "copied" ? "Install command copied" : "Copy install command"}
              >
                {status === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {status === "copied" ? "Copied" : status === "failed" ? "Try again" : "Copy"}
              </button>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {status === "copied"
              ? "Install command copied to clipboard."
              : status === "failed"
                ? "The install command could not be copied."
                : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
