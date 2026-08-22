function BranchConnector({ merge = false }: { merge?: boolean }) {
  return (
    <div className="relative mx-auto h-12 w-full max-w-[30rem]" aria-hidden="true">
      <span
        className={`absolute left-1/2 h-1/2 w-px -translate-x-1/2 bg-ration-dark/25 ${merge ? "bottom-0" : "top-0"}`}
      />
      <span className="absolute top-1/2 right-1/4 left-1/4 h-px bg-ration-dark/25" />
      <span
        className={`absolute left-1/4 h-1/2 w-px -translate-x-1/2 bg-ration-dark/25 ${merge ? "top-0" : "bottom-0"}`}
      />
      <span
        className={`absolute left-3/4 h-1/2 w-px -translate-x-1/2 bg-ration-dark/25 ${merge ? "top-0" : "bottom-0"}`}
      />
    </div>
  );
}

const nodeStyles =
  "flex min-h-16 items-center justify-center rounded-md border border-ration-dark/15 bg-white px-4 text-center font-mono text-xs font-semibold tracking-[0.1em] text-ration-dark uppercase shadow-card mobile:text-sm";

export function ArchitectureSection() {
  return (
    <section
      id="architecture"
      className="overflow-hidden border-t border-ration-dark/10 bg-[#eeede8] px-gutter py-section"
      aria-labelledby="architecture-title"
    >
      <div className="mx-auto max-w-content">
        <div className="grid gap-12 desktop:grid-cols-[minmax(18rem,0.75fr)_minmax(28rem,1.25fr)] desktop:items-center desktop:gap-20">
          <div>
            <p className="mb-6 flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.17em] text-ration-orange uppercase mobile:text-xs">
              <span className="h-px w-8 bg-ration-orange" aria-hidden="true" />
              Architecture
            </p>
            <h2
              id="architecture-title"
              className="max-w-[12ch] text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.06em] text-ration-dark"
            >
              Simple infrastructure.
              <br />
              <span className="text-ration-dark/38">Explicit boundaries.</span>
            </h2>
          </div>

          <div className="rounded-lg border border-ration-dark/12 bg-ration-background p-5 shadow-[0_24px_70px_rgb(28_28_28/0.09)] mobile:p-8 tablet:p-10">
            <div className="mx-auto max-w-[30rem]">
              <div className={`${nodeStyles} mx-auto w-36 border-ration-orange/45 bg-ration-orange text-white`}>
                Ration
              </div>

              <BranchConnector />

              <div className="grid grid-cols-2 gap-4 mobile:gap-8">
                <div className={nodeStyles}>WDK CLI</div>
                <div className={nodeStyles}>Process</div>
              </div>

              <BranchConnector merge />

              <div className={`${nodeStyles} mx-auto w-40 border-ration-orange/30 bg-ration-orange/[0.07] text-ration-orange-dark`}>
                Sandbox
              </div>
              <div className="mx-auto h-9 w-px bg-ration-dark/25" aria-hidden="true" />
              <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-ration-dark/15 bg-white font-mono text-xs font-semibold tracking-[0.05em] text-ration-dark shadow-card">
                USD₮
              </div>
            </div>

            <p className="mt-9 border-t border-ration-dark/10 pt-5 text-center font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-ration-dark/40 uppercase mobile:text-[0.6875rem]">
              Powered by <span className="text-ration-dark">Tether WDK</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
