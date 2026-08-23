import { Boxes, SlidersHorizontal, Timer, Trash2 } from "lucide-react";

const principles = [
  { number: "01", title: "Isolated", description: "One sandbox per workload.", Icon: Boxes },
  { number: "02", title: "Temporary", description: "Access exists for the session.", Icon: Timer },
  { number: "03", title: "Explicit", description: "Funding is intentional.", Icon: SlidersHorizontal },
  { number: "04", title: "Disposable", description: "Built to be locked and left.", Icon: Trash2 },
];

export function SecurityPrinciples() {
  return (
    <section id="security" className="border-b bg-surface px-gutter py-section" aria-labelledby="security-title">
      <div className="mx-auto max-w-content">
        <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">Security / design constraints</p>
        <h2 id="security-title" className="display-type max-w-[12ch] text-[clamp(3rem,7vw,6.5rem)] leading-[0.86]">Boundaries, not promises.</h2>
        <div className="mt-14 border-t">
          {principles.map(({ number, title, description, Icon }) => (
            <article key={number} className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b py-6 mobile:grid-cols-[4rem_1fr_1fr_auto] mobile:gap-5">
              <span className="font-mono text-xs text-ration-orange">{number}</span>
              <h3 className="display-type text-[clamp(1.8rem,5vw,4.5rem)] leading-none transition-transform group-hover:translate-x-1">{title}</h3>
              <p className="hidden text-sm text-muted mobile:block">{description}</p>
              <Icon size={30} strokeWidth={1.6} className="text-muted group-hover:text-ration-orange" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
