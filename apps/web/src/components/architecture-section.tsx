import { Bot, CheckCircle2, Command, FileClock, Network, RotateCcw, Terminal, Wallet } from "lucide-react";

function Node({ label, Icon, accent = false }: { label: string; Icon: typeof Command; accent?: boolean }) {
  return (
    <div className={`flex min-h-16 items-center justify-center gap-3 border px-4 font-mono text-xs uppercase tracking-[0.1em] ${accent ? "border-ration-orange text-ration-orange" : "text-foreground"}`}>
      <Icon size={23} strokeWidth={1.7} /> {label}
    </div>
  );
}

export function ArchitectureSection() {
  const lifecycle = [
    { title: "Approve", detail: "Preview the test USDT budget and Sepolia gas before anything is broadcast.", Icon: CheckCircle2 },
    { title: "Isolate", detail: "Derive a session-specific standard Sepolia EOA without registering another WDK CLI wallet.", Icon: Wallet },
    { title: "Attach", detail: "Expose only the sandbox through a private MCP connection to Codex or OpenCode.", Icon: Network },
    { title: "Run", detail: "The command can spend the funded test USDT balance; an optional TTL can end financial access.", Icon: Bot },
    { title: "Return", detail: "Attempt to sweep unused USDT and economical ETH back to the treasury, then dispose the sandbox.", Icon: RotateCcw },
    { title: "Record", detail: "Write a local receipt. Funded crash journals can be retried with ration recover.", Icon: FileClock },
  ];

  return (
    <section id="ration" className="border-b px-gutter py-section" aria-labelledby="ration-title">
      <div className="mx-auto max-w-content">
        <div className="grid gap-12 desktop:grid-cols-[0.72fr_1.28fr] desktop:items-center">
          <div>
            <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ration-orange">The answer / Ration</p>
            <h2 id="ration-title" className="display-type max-w-[11ch] text-[clamp(3rem,6.5vw,6rem)] leading-[0.86]">The command becomes the boundary.</h2>
            <p className="mt-7 max-w-md text-base leading-7 text-muted">Ration keeps the persistent WDK treasury outside the agent&apos;s MCP surface and funds a separate wallet for one session.</p>
          </div>

          <div className="technical-grid border p-4 mobile:p-8">
            <div className="mx-auto max-w-xl bg-background p-4 mobile:p-7">
              <div className="mx-auto max-w-72"><Node label="Human-held WDK treasury" Icon={Terminal} /></div>
              <div className="relative mx-auto flex h-16 items-center justify-center">
                <span className="absolute inset-y-0 w-px bg-ration-orange" aria-hidden="true" />
                <span className="relative max-w-40 bg-background px-2 text-center font-mono text-[0.55rem] uppercase tracking-widest text-muted">approved test USDT + gas</span>
              </div>
              <div className="mx-auto max-w-72"><Node label="Session EOA" Icon={Wallet} accent /></div>
              <div className="mx-auto h-8 w-px bg-ration-orange" />
              <div className="grid gap-3 mobile:grid-cols-2">
                <Node label="Private Ration MCP" Icon={Network} />
                <Node label="Codex / OpenCode" Icon={Bot} />
              </div>
              <div className="mx-auto h-8 w-px bg-border" />
              <div className="mx-auto max-w-72"><Node label="Return + receipt" Icon={Command} accent /></div>
              <div className="mt-7 flex flex-wrap justify-center gap-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                <span>Sepolia today</span><span className="text-ration-orange">/</span><span>test USDT</span><span className="text-ration-orange">/</span><span>standard EOA</span>
              </div>
            </div>
          </div>
        </div>

        <ol className="mt-16 grid border-t tablet:grid-cols-2 desktop:grid-cols-3">
          {lifecycle.map(({ title, detail, Icon }, index) => (
            <li key={title} className="grid min-h-52 grid-cols-[2.75rem_1fr] gap-3 border-b py-7 tablet:border-r tablet:px-6 tablet:even:border-r-0 desktop:even:border-r desktop:[&:nth-child(3n)]:border-r-0">
              <span className="font-mono text-[0.65rem] text-ration-orange">{String(index + 1).padStart(2, "0")}</span>
              <div><Icon size={28} strokeWidth={1.6} /><h3 className="display-type mt-7 text-3xl">{title}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-muted">{detail}</p></div>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-2xl font-mono text-[0.65rem] leading-5 text-muted">Cleanup and in-memory disposal are best-effort operations. Ration reports incomplete recovery instead of presenting it as guaranteed.</p>
      </div>
    </section>
  );
}
