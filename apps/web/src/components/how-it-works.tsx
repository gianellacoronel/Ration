import { Coins, Lock, Terminal, Unlock } from "lucide-react";

const steps = [
  { number: "01", title: "Fund", description: "Move an explicit amount into a sandbox.", Icon: Coins },
  { number: "02", title: "Unlock", description: "Open only that sandbox for the session.", Icon: Unlock },
  { number: "03", title: "Run", description: "The process can use only allocated funds.", Icon: Terminal },
  { number: "04", title: "Lock", description: "Close access when the process exits.", Icon: Lock },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b bg-surface px-gutter py-section" aria-labelledby="how-title">
      <div className="mx-auto max-w-content">
        <div className="grid gap-8 tablet:grid-cols-[1fr_auto] tablet:items-end">
          <div>
            <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">Operation manual / 01-04</p>
            <h2 id="how-title" className="display-type max-w-[11ch] text-[clamp(3rem,7vw,6.5rem)] leading-[0.86]">Money in. Process out.</h2>
          </div>
          <p className="max-w-xs border-l pl-5 text-sm leading-6 text-muted">Four explicit actions. No ambient wallet access. No hidden custody.</p>
        </div>

        <ol className="relative mt-16 grid gap-0 border-t desktop:grid-cols-4">
          {steps.map(({ number, title, description, Icon }) => (
            <li key={number} className="group relative grid grid-cols-[4rem_1fr] border-b py-7 desktop:block desktop:border-r desktop:border-b-0 desktop:px-6 desktop:py-9 last:border-r-0">
              <span className="absolute -top-1.5 left-0 size-3 bg-ration-orange desktop:left-6" />
              <span className="font-mono text-xs text-ration-orange">{number}</span>
              <div>
                <Icon size={36} strokeWidth={1.7} className="mb-8 text-foreground transition-transform group-hover:-rotate-6 desktop:mb-14" />
                <h3 className="display-type text-3xl">{title}</h3>
                <p className="mt-3 max-w-[14rem] text-sm leading-6 text-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
