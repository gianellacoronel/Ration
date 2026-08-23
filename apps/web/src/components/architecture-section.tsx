import { Bot, Coins, Command, Network, Terminal, Wallet } from "lucide-react";

function Node({ label, Icon, accent = false }: { label: string; Icon: typeof Command; accent?: boolean }) {
  return (
    <div className={`flex min-h-16 items-center justify-center gap-3 border px-4 font-mono text-xs uppercase tracking-[0.1em] ${accent ? "border-ration-orange text-ration-orange" : "text-foreground"}`}>
      <Icon size={23} strokeWidth={1.7} /> {label}
    </div>
  );
}

export function ArchitectureSection() {
  return (
    <section id="architecture" className="border-b px-gutter py-section" aria-labelledby="architecture-title">
      <div className="mx-auto grid max-w-content gap-14 desktop:grid-cols-[0.75fr_1.25fr] desktop:items-center">
        <div>
          <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">Architecture / system map</p>
          <h2 id="architecture-title" className="display-type max-w-[10ch] text-[clamp(3rem,6.5vw,6rem)] leading-[0.86]">Small surface. Hard edges.</h2>
          <p className="mt-7 max-w-sm text-sm leading-6 text-muted">Ration sits between a command and the funds it is allowed to reach. Powered by Tether WDK.</p>
        </div>

        <div className="technical-grid border p-5 mobile:p-9">
          <div className="mx-auto max-w-xl bg-background p-4 mobile:p-7">
            <div className="mx-auto max-w-48"><Node label="Ration" Icon={Command} accent /></div>
            <div className="mx-auto h-8 w-px bg-ration-orange" />
            <div className="mx-auto max-w-72"><Node label="Treasury / WDK CLI" Icon={Terminal} /></div>
            <div className="mx-auto flex h-12 w-px items-center bg-ration-orange"><span className="ml-3 whitespace-nowrap font-mono text-[0.55rem] uppercase tracking-widest text-muted">exact budget</span></div>
            <div className="mx-auto max-w-72"><Node label="In-memory WDK sandbox" Icon={Wallet} accent /></div>
            <div className="mx-auto h-8 w-px bg-border" />
            <div className="grid grid-cols-2 gap-4">
              <Node label="Restricted MCP / next" Icon={Network} />
              <Node label="Process" Icon={Bot} />
            </div>
            <div className="mx-auto h-8 w-px bg-ration-orange" />
            <div className="mx-auto flex w-fit items-center gap-3 border-b border-ration-orange px-5 py-3 font-mono text-sm font-semibold"><Coins size={24} className="text-ration-orange" /> sweep / dispose</div>
            <div className="mt-8 flex flex-wrap justify-center gap-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted">
              <span>persistent treasury</span><span className="text-ration-orange">/</span><span>ephemeral agent</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
