import { Bot, KeyRound, LogOut, Play, Wallet } from "lucide-react";

export function ProblemSection() {
  return (
    <section id="problem" className="border-b px-gutter py-section" aria-labelledby="problem-title">
      <div className="mx-auto max-w-content">
        <div className="grid gap-8 tablet:grid-cols-[1.25fr_0.75fr] tablet:items-end">
          <div>
            <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">The mismatch / work versus access</p>
            <h2 id="problem-title" className="display-type max-w-[12ch] text-[clamp(2.8rem,7.5vw,6.8rem)] leading-[0.86] text-foreground">
              Software runs one job. Wallet access outlives it.
            </h2>
          </div>
          <p className="max-w-sm border-l-2 border-ration-orange pl-5 text-base leading-7 text-muted">
            A process may need to pay once. A wallet is a reusable identity, a balance, and a set of credentials that remain valuable after the process exits.
          </p>
        </div>

        <div className="mt-16 border-y" role="img" aria-label="A process ends while reusable wallet access continues">
          <div className="grid border-b tablet:grid-cols-[10rem_1fr]">
            <div className="flex items-center gap-3 border-b px-4 py-5 tablet:border-r tablet:border-b-0">
              <Bot size={22} strokeWidth={1.7} />
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em]">The job</span>
            </div>
            <div className="grid grid-cols-3">
              <div className="flex min-h-24 flex-col justify-center border-r px-3 mobile:px-6">
                <Play size={20} className="text-ration-orange" />
                <span className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted">starts</span>
              </div>
              <div className="flex min-h-24 items-center justify-center border-r font-mono text-[0.65rem] uppercase tracking-[0.12em]">working</div>
              <div className="flex min-h-24 flex-col justify-center px-3 mobile:px-6">
                <LogOut size={20} />
                <span className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted">exits</span>
              </div>
            </div>
          </div>
          <div className="grid tablet:grid-cols-[10rem_1fr]">
            <div className="flex items-center gap-3 border-b px-4 py-5 tablet:border-r tablet:border-b-0">
              <Wallet size={22} strokeWidth={1.7} />
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em]">The wallet</span>
            </div>
            <div className="relative grid grid-cols-3 overflow-hidden">
              <span className="absolute top-1/2 right-0 left-0 h-0.5 bg-ration-orange" />
              <div className="relative flex min-h-28 items-center px-3 mobile:px-6"><KeyRound className="bg-background pr-2 text-ration-orange" size={28} /></div>
              <div className="relative flex min-h-28 items-center justify-center"><span className="bg-background px-3 font-mono text-[0.6rem] uppercase tracking-[0.1em]">available</span></div>
              <div className="relative flex min-h-28 items-center justify-end px-3 mobile:px-6"><span className="bg-background pl-3 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ration-orange">still valuable →</span></div>
            </div>
          </div>
        </div>
        <p className="hand-type mt-5 text-right text-2xl text-muted mobile:text-3xl">the job has an ending. access often doesn&apos;t.</p>
      </div>
    </section>
  );
}
