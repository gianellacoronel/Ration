import { Cable, Fuel, KeyRound, Undo2 } from "lucide-react";

const steps = [
  { number: "01", title: "Create", description: "Create or select a wallet the process can use.", Icon: KeyRound },
  { number: "02", title: "Provision", description: "Estimate the job, then add tokens and network gas.", Icon: Fuel },
  { number: "03", title: "Connect", description: "Wire wallet access into the process and its environment.", Icon: Cable },
  { number: "04", title: "Reconcile", description: "Inspect activity and decide what to do with leftovers.", Icon: Undo2 },
];

export function HowItWorks() {
  return (
    <section id="current-way" className="border-b bg-surface px-gutter py-section" aria-labelledby="current-way-title">
      <div className="mx-auto max-w-content">
        <div className="grid gap-8 tablet:grid-cols-[1fr_auto] tablet:items-end">
          <div>
            <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">Without Ration / every run is manual</p>
            <h2 id="current-way-title" className="display-type section-title max-w-[14ch]">A small payment becomes a wallet problem.</h2>
          </div>
          <p className="max-w-xs border-l pl-5 text-sm leading-6 text-muted">You fund access, wire it into the job, then clean up what remains.</p>
        </div>

        <ol className="relative mt-12 grid gap-0 border-t desktop:grid-cols-4">
          {steps.map(({ number, title, description, Icon }) => (
            <li key={number} className="group relative grid grid-cols-[4rem_1fr] border-b py-7 desktop:block desktop:border-r desktop:border-b-0 desktop:px-6 desktop:py-9 last:border-r-0">
              <span className="absolute -top-1.5 left-0 size-3 bg-ration-orange" />
              <span className="font-mono text-[0.6rem] text-ration-orange desktop:mb-10 desktop:block">{number}</span>
              <div>
                <Icon size={36} strokeWidth={1.7} className="mb-8 text-foreground transition-transform" />
                <h3 className="display-type text-2xl">{title}</h3>
                <p className="mt-3 max-w-[14rem] text-sm leading-6 text-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
