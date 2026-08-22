import { getStartedHref, githubHref } from "@/config/navigation";
import { TerminalDemo } from "@/components/terminal-demo";

const primaryCtaStyles =
  "inline-flex min-h-12 items-center justify-center rounded-sm bg-ration-orange px-6 text-sm font-semibold text-ration-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-ration-orange-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange";

const secondaryCtaStyles =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border border-ration-dark/15 bg-transparent px-6 text-sm font-semibold text-ration-dark transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-ration-dark/30 hover:bg-ration-white/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange";

export function Hero() {
  return (
    <section className="overflow-hidden" aria-labelledby="hero-title">
      <div className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-content desktop:grid-cols-[1.04fr_0.96fr]">
        <div className="animate-fade-up px-gutter py-16 tablet:py-20 desktop:flex desktop:flex-col desktop:justify-center desktop:border-r desktop:py-section">
          <p className="mb-7 flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.17em] text-ration-orange uppercase mobile:text-xs">
            <span className="h-px w-8 bg-ration-orange" aria-hidden="true" />
            Financial sandboxes for processes
          </p>

          <h1
            id="hero-title"
            className="max-w-[11ch] text-[clamp(3.25rem,8.2vw,6.75rem)] leading-[0.91] font-semibold tracking-[-0.065em] text-ration-dark desktop:text-[clamp(4.5rem,6vw,6.25rem)]"
          >
            Give every process
            <br />
            <span className="text-ration-orange">its own money.</span>
          </h1>

          <p className="mt-8 max-w-[32rem] text-base leading-7 text-ration-dark/60 mobile:text-lg mobile:leading-8">
            Ration gives processes isolated, disposable wallets
            <br className="hidden mobile:block" /> with temporary access to real
            funds.
          </p>

          <div className="mt-9 flex flex-col gap-3 mobile:flex-row">
            <a href={getStartedHref} className={primaryCtaStyles}>
              Get started
            </a>
            <a href={githubHref} className={secondaryCtaStyles}>
              View on GitHub
              <svg
                viewBox="0 0 16 16"
                className="size-4"
                aria-hidden="true"
                fill="none"
              >
                <path
                  d="M4 12 12 4m0 0H6.5M12 4v5.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </div>

        <div className="relative flex min-w-0 items-center bg-ration-orange px-gutter py-16 tablet:py-20 desktop:py-section">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.09]"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(rgb(255 255 255 / 0.7) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.7) 1px, transparent 1px)",
              backgroundSize: "3rem 3rem",
            }}
          />
          <div className="relative w-full min-w-0 desktop:-ml-px">
            <TerminalDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
