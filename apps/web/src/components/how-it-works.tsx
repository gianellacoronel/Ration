import { Eraser, Plus, Terminal, Wallet } from "lucide-react";

const steps = [
  { number: "01", title: "Create", description: "Derive one in-memory wallet for this run.", Icon: Plus },
  { number: "02", title: "Fund", description: "Provision gas, then move the exact USDT budget.", Icon: Wallet },
  { number: "03", title: "Run", description: "Restricted MCP wallet access is the next integration.", Icon: Terminal },
  { number: "04", title: "Erase", description: "Sweep USDT, recover ETH, then dispose every key.", Icon: Eraser },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b bg-surface px-gutter py-section" aria-labelledby="how-title">
      <div className="mx-auto max-w-content">
        <div className="grid gap-8 tablet:grid-cols-[1fr_auto] tablet:items-end">
          <div>
            <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">Operation manual</p>
            <h2 id="how-title" className="display-type max-w-[11ch] text-[clamp(3rem,7vw,6.5rem)] leading-[0.86]">Money in. Process out.</h2>
          </div>
          <p className="max-w-xs border-l pl-5 text-sm leading-6 text-muted">One treasury unlock. No sandbox passphrase. No persistent agent wallet.</p>
        </div>

        <ol className="relative mt-16 grid gap-0 border-t desktop:grid-cols-4">
          {steps.map(({ number, title, description, Icon }) => (
            <li key={number} className="group relative grid grid-cols-[4rem_1fr] border-b py-7 desktop:block desktop:border-r desktop:border-b-0 desktop:px-6 desktop:py-9 last:border-r-0">
              <span className="absolute -top-1.5 left-0 size-3 bg-ration-orange" />
              <div>
                <Icon size={36} strokeWidth={1.7} className="mb-8 text-foreground transition-transform" />
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
