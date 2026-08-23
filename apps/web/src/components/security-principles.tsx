import { ArrowRight, FileClock, FlaskConical, ShieldAlert } from "lucide-react";

const cases = [
  {
    label: "Paid agent research",
    process: "Codex or OpenCode discovers and buys a bundled demo resource.",
    boundary: "The MCP sees the session EOA, never the treasury.",
    result: "A deterministic sample is unlocked by a real Sepolia test-USDT payment.",
    Icon: FlaskConical,
  },
  {
    label: "Hostile input demo",
    process: "An agent reads demo notes containing an instruction to drain its funds.",
    boundary: "Only the funded sandbox balance is reachable through Ration MCP.",
    result: "The demo exposes the blast radius instead of claiming to prevent the prompt injection.",
    Icon: ShieldAlert,
  },
  {
    label: "Interrupted work",
    process: "A command exits, receives a signal, or leaves a funded crash journal.",
    boundary: "Cleanup closes spending before attempting USDT and economical ETH returns.",
    result: "History records the outcome; recover can retry incomplete funded sessions.",
    Icon: FileClock,
  },
];

export function SecurityPrinciples() {
  return (
    <section id="use-cases" className="border-b px-gutter py-section" aria-labelledby="use-cases-title">
      <div className="mx-auto max-w-content">
        <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">Where it fits / current scope</p>
        <h2 id="use-cases-title" className="display-type max-w-[13ch] text-[clamp(3rem,7vw,6.5rem)] leading-[0.86]">Use the boundary where money meets uncertain work.</h2>
        <div className="mt-14 border-t">
          {cases.map(({ label, process, boundary, result, Icon }) => (
            <article key={label} className="grid gap-6 border-b py-8 desktop:grid-cols-[0.65fr_1fr_auto_1fr_auto_1fr] desktop:items-center desktop:gap-5 desktop:py-10">
              <div><Icon size={30} strokeWidth={1.6} className="mb-5 text-ration-orange" /><h3 className="display-type text-3xl leading-none">{label}</h3></div>
              <div><p className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ration-orange">Process</p><p className="text-sm leading-6 text-muted">{process}</p></div>
              <ArrowRight className="hidden text-ration-orange desktop:block" size={20} aria-hidden="true" />
              <div><p className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ration-orange">Sandbox</p><p className="text-sm leading-6 text-muted">{boundary}</p></div>
              <ArrowRight className="hidden text-ration-orange desktop:block" size={20} aria-hidden="true" />
              <div><p className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ration-orange">Result</p><p className="text-sm leading-6 text-muted">{result}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
