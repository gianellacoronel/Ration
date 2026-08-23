import { ArrowRight, Wallet } from "lucide-react";

export function AgentsSection() {
  return (
    <section id="insight" className="overflow-hidden border-b bg-ration-orange px-gutter py-section text-ration-dark" aria-labelledby="insight-title">
      <div className="mx-auto max-w-content">
        <p className="mb-8 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em]">The shift / wallet → run</p>
        <h2 id="insight-title" className="display-type section-title max-w-[16ch]">
          Fund the run, not the agent.
        </h2>
        <div className="mt-10 grid gap-7 border-t border-ration-dark/35 pt-7 tablet:grid-cols-[1fr_auto_1fr] tablet:items-center">
          <div className="flex items-center gap-4">
            <Wallet size={34} strokeWidth={1.5} />
            <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.1em]">Your wallet</p><p className="mt-1 text-sm text-ration-dark/65">Stays with you</p></div>
          </div>
          <div className="flex items-center gap-3" aria-hidden="true"><ArrowRight size={24} /></div>
          <p className="max-w-md text-lg leading-7 tablet:justify-self-end">Each run gets its own budget, deadline, and return path.</p>
        </div>
      </div>
    </section>
  );
}
