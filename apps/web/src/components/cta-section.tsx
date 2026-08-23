import { ArrowRight, GitFork, Terminal } from "lucide-react";

import { getStartedHref, githubHref } from "@/config/navigation";

export function CtaSection() {
  return (
    <section id="get-started" className="relative overflow-hidden bg-ration-orange px-gutter py-section text-ration-dark" aria-labelledby="cta-title">
      <Terminal className="absolute -right-8 -bottom-8 rotate-[-7deg] opacity-20" size={260} strokeWidth={1.2} aria-hidden="true" />
      <div className="relative mx-auto max-w-content">
        <p className="mb-6 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em]">Ready / execute</p>
        <h2 id="cta-title" className="display-type max-w-[10ch] text-[clamp(3.4rem,9vw,8rem)] leading-[0.82]">Put a hard limit on software.</h2>
        <p className="hand-type mt-5 text-3xl mobile:text-4xl">Money, but with boundaries.</p>
        <div className="mt-10 flex flex-col gap-3 mobile:flex-row">
          <a href={getStartedHref} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-sm bg-ration-dark px-6 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ration-cream"><ArrowRight size={18} /> Try the CLI</a>
          <a href={githubHref} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-sm border border-ration-dark px-6 font-mono text-xs font-semibold uppercase tracking-[0.08em]"><GitFork size={18} /> View source</a>
        </div>
      </div>
    </section>
  );
}
