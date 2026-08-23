import { ArrowDown, Bot, Coins, LockKeyhole, Wallet } from "lucide-react";

export function AgentsSection() {
  return (
    <section id="agents" className="overflow-hidden border-b px-gutter py-section" aria-labelledby="agents-title">
      <div className="mx-auto grid max-w-content gap-14 desktop:grid-cols-[1.05fr_0.95fr] desktop:items-center">
        <div>
          <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">For agents / least privilege</p>
          <h2 id="agents-title" className="display-type max-w-[10ch] text-[clamp(3rem,7vw,6.4rem)] leading-[0.86]">
            Agents need money. <span className="text-ration-orange">Not your wallet.</span>
          </h2>
          <p className="mt-8 max-w-md text-base leading-7 text-muted">Give autonomous software enough funds to finish one job, for exactly as long as the job runs.</p>
        </div>

        <div className="relative mx-auto w-full max-w-lg border-y py-10" role="img" aria-label="An agent receives five USDT through an isolated locked sandbox">
          <div className="flex flex-col items-center">
            <Bot size={58} strokeWidth={1.5} />
            <span className="mt-2 font-mono text-xs uppercase tracking-[0.12em]">Agent</span>
            <ArrowDown className="my-5 text-ration-orange" size={26} />
            <div className="flex items-center gap-4 border border-ration-orange px-6 py-4">
              <LockKeyhole size={32} strokeWidth={1.7} className="text-ration-orange" />
              <div><p className="font-mono text-xs uppercase tracking-[0.1em]">Sandbox_01</p><p className="mt-1 font-mono text-[0.65rem] text-muted">TTL 10m</p></div>
            </div>
            <ArrowDown className="my-5 text-ration-orange" size={26} />
            <div className="flex items-center gap-3"><Coins size={34} strokeWidth={1.7} /><span className="display-type text-3xl">$5 USDT</span></div>
          </div>
          <Wallet className="absolute top-7 right-1 rotate-12 text-faint mobile:right-8" size={50} strokeWidth={1.4} aria-hidden="true" />
          <span className="hand-type absolute top-21 right-0 rotate-6 text-2xl text-ration-orange mobile:right-2">just enough</span>
        </div>
      </div>
    </section>
  );
}
