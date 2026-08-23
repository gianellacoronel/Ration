import { Bot, Terminal, Wallet, Workflow } from "lucide-react";

const processes = [
  { label: "Agent", Icon: Bot },
  { label: "CLI", Icon: Terminal },
  { label: "Script", Icon: Workflow },
];

function ProcessRow({ isolated = false }: { isolated?: boolean }) {
  return (
    <div className="relative grid grid-cols-3 gap-2 pt-9 mobile:gap-5">
      <span className={`absolute top-0 right-[16.66%] left-[16.66%] h-px ${isolated ? "bg-ration-orange" : "bg-border"}`} />
      {processes.map(({ label, Icon }, index) => (
        <div className="relative flex flex-col items-center text-center" key={label}>
          <span className={`absolute -top-9 h-9 w-px ${isolated ? "bg-ration-orange" : "bg-border"}`} />
          {isolated && <span className="mb-2 font-mono text-[0.65rem] font-semibold text-ration-orange">{["$5", "$2", "$10"][index]}</span>}
          <Icon size={30} strokeWidth={1.7} className={isolated ? "text-ration-orange" : "text-foreground"} />
          <span className="mt-2 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-muted">{isolated ? `sandbox ${index + 1}` : label}</span>
        </div>
      ))}
    </div>
  );
}

export function ProblemSection() {
  return (
    <section id="product" className="border-b px-gutter py-section" aria-labelledby="problem-title">
      <div className="mx-auto max-w-content">
        <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">Problem / access model</p>
        <h2 id="problem-title" className="display-type max-w-[12ch] text-[clamp(2.8rem,7.5vw,6.8rem)] leading-[0.86] text-foreground">
          Your wallet shouldn&apos;t be your process&apos;s wallet.
        </h2>

        <div className="mt-14 grid border-y desktop:grid-cols-2">
          <article className="px-3 py-9 mobile:px-8 desktop:border-r desktop:py-12">
            <div className="flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted">
              <h3>Without Ration</h3><span>shared risk</span>
            </div>
            <div className="mx-auto mt-10 max-w-md">
              <div className="flex flex-col items-center">
                <Wallet size={44} strokeWidth={1.6} />
                <span className="mt-2 font-mono text-xs uppercase tracking-[0.1em]">One wallet</span>
                <span className="h-10 w-px bg-border" />
              </div>
              <ProcessRow />
            </div>
          </article>
          <article className="bg-surface px-3 py-9 mobile:px-8 desktop:py-12">
            <div className="flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ration-orange">
              <h3>With Ration</h3><span>explicit limits</span>
            </div>
            <div className="mx-auto mt-10 max-w-md">
              <div className="flex flex-col items-center">
                <Wallet size={44} strokeWidth={1.6} className="text-ration-orange" />
                <span className="mt-2 font-mono text-xs uppercase tracking-[0.1em]">Main wallet</span>
                <span className="h-10 w-px bg-ration-orange" />
              </div>
              <ProcessRow isolated />
            </div>
          </article>
        </div>
        <p className="hand-type mt-5 text-right text-2xl text-muted mobile:text-3xl">same funds. smaller blast radius.</p>
      </div>
    </section>
  );
}
