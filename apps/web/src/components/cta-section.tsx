import { getStartedHref, githubHref } from "@/config/navigation";

const primaryCtaStyles =
  "inline-flex min-h-12 items-center justify-center rounded-sm bg-ration-orange px-7 text-sm font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-ration-orange-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange-light";

const secondaryCtaStyles =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border border-white/20 px-7 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange-light";

export function CtaSection() {
  return (
    <section
      id="get-started"
      className="relative isolate overflow-hidden bg-ration-dark px-gutter py-section text-white"
      aria-labelledby="cta-title"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-20"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgb(247 79 6 / 0.3) 1px, transparent 1px), linear-gradient(90deg, rgb(247 79 6 / 0.3) 1px, transparent 1px)",
          backgroundSize: "4rem 4rem",
          maskImage: "linear-gradient(to bottom, transparent, black 35%, transparent)",
        }}
      />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[26rem] -translate-1/2 rounded-full bg-ration-orange/10 blur-[100px]" aria-hidden="true" />

      <div className="mx-auto flex max-w-content flex-col items-center text-center">
        <p className="mb-7 font-mono text-[0.6875rem] font-semibold tracking-[0.18em] text-ration-orange-light uppercase mobile:text-xs">
          Start building
        </p>
        <h2
          id="cta-title"
          className="max-w-[12ch] text-[clamp(3rem,8vw,7rem)] leading-[0.9] font-semibold tracking-[-0.065em]"
        >
          Give your processes
          <br />
          <span className="text-ration-orange">their own money.</span>
        </h2>
        <p className="mt-8 max-w-[34rem] text-base leading-7 text-white/55 mobile:text-lg mobile:leading-8">
          Isolated financial sandboxes
          <br className="hidden mobile:block" /> for the next generation of software.
        </p>
        <div className="mt-10 flex w-full max-w-sm flex-col gap-3 mobile:w-auto mobile:max-w-none mobile:flex-row">
          <a href={getStartedHref} className={primaryCtaStyles}>
            Get started
          </a>
          <a href={githubHref} className={secondaryCtaStyles}>
            View on GitHub
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path d="M4 12 12 4m0 0H6.5M12 4v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
