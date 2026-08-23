import { ArrowRight, Scissors, Wallet } from "lucide-react";

export function AgentsSection() {
  return (
    <section id="insight" className="overflow-hidden border-b bg-ration-orange px-gutter py-section text-ration-dark" aria-labelledby="insight-title">
      <div className="mx-auto max-w-content">
        <p className="mb-8 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em]">Change the unit / wallet → run</p>
        <h2 id="insight-title" className="display-type max-w-[14ch] text-[clamp(3.2rem,8.5vw,8rem)] leading-[0.84]">
          What if money was issued for the run, not entrusted to the runner?
        </h2>
        <div className="mt-14 grid gap-8 border-t border-ration-dark/35 pt-8 tablet:grid-cols-[1fr_auto_1fr] tablet:items-center">
          <div className="flex items-center gap-4">
            <Wallet size={34} strokeWidth={1.5} />
            <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.1em]">Persistent treasury</p><p className="mt-1 text-sm text-ration-dark/65">Held by the human</p></div>
          </div>
          <div className="flex items-center gap-3" aria-hidden="true"><span className="h-px w-12 bg-ration-dark" /><Scissors size={24} /><ArrowRight size={24} /></div>
          <p className="max-w-md text-xl leading-8 tablet:justify-self-end">A separate session balance can have an approved start, a visible limit, and a cleanup path.</p>
        </div>
      </div>
    </section>
  );
}
