import { ArrowDownRight, ArrowRight, Bot, Coins, GitFork, LockKeyhole, Terminal, Wallet } from "lucide-react";

import { TerminalDemo } from "@/components/terminal-demo";
import { getStartedHref, githubHref } from "@/config/navigation";

export function Hero() {
  return (
    <section className="overflow-hidden border-b" aria-labelledby="hero-title">
      <div className="mx-auto max-w-content px-gutter py-12 tablet:py-18 desktop:py-22">
        <div className="mb-10 flex items-center justify-between gap-6 border-b pb-4 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted">
          <span>A CLI for money with boundaries</span>
          <span className="hidden items-center gap-2 mobile:flex"><span className="size-2 bg-ration-orange" /> v0.1 / live</span>
        </div>

        <div className="relative grid gap-12 desktop:grid-cols-12 desktop:items-start">
          <div className="relative z-10 desktop:col-span-8">
            <h1 id="hero-title" className="display-type max-w-[9.5ch] text-[clamp(3.75rem,10.5vw,9.25rem)] leading-[0.82] text-foreground">
              Give every process <span className="text-ration-orange">its own money.</span>
            </h1>
            <p className="hand-type mt-6 rotate-[-2deg] text-[clamp(1.7rem,3vw,2.5rem)] leading-none text-foreground">
              Give agents a ration, not your wallet.
            </p>
            <div className="mt-9 flex flex-col gap-3 mobile:flex-row">
              <a href={getStartedHref} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-sm bg-ration-orange px-6 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ration-dark hover:bg-ration-orange-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange">
                Run the CLI <ArrowRight size={18} />
              </a>
              <a href={githubHref} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-sm border px-6 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-foreground hover:border-ration-orange hover:text-ration-orange focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange">
                <GitFork size={18} /> View source
              </a>
            </div>
          </div>

          <div className="relative hidden min-h-72 desktop:col-span-4 desktop:block" aria-hidden="true">
            <Wallet className="absolute top-2 left-8 rotate-[-8deg] text-foreground" size={62} strokeWidth={1.5} />
            <Coins className="absolute top-22 right-7 rotate-12 text-ration-orange" size={50} strokeWidth={1.7} />
            <Bot className="absolute top-38 left-2 rotate-3 text-foreground" size={58} strokeWidth={1.5} />
            <Terminal className="absolute right-12 bottom-2 rotate-[-5deg] text-foreground" size={64} strokeWidth={1.5} />
            <LockKeyhole className="absolute bottom-0 left-30 text-ration-orange" size={35} strokeWidth={1.8} />
            <span className="absolute top-28 left-21 h-px w-28 rotate-12 bg-border" />
            <span className="hand-type absolute right-0 bottom-18 rotate-6 text-2xl text-muted">temporary by design</span>
          </div>

          <div className="relative desktop:col-span-10 desktop:col-start-3 desktop:-mt-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
              <span>01 / executable boundary</span>
              <ArrowDownRight size={18} className="text-ration-orange" />
            </div>
            <TerminalDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
