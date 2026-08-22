"use client";

import { useEffect, useRef, useState } from "react";

const steps = [
  {
    number: "01",
    name: "Fund",
    title: "Fund an isolated sandbox",
    description: (
      <>
        Move an explicit amount of USD₮
        <br className="hidden tablet:block" />
        into an existing Ration sandbox.
      </>
    ),
    state: "USD₮ allocated",
  },
  {
    number: "02",
    name: "Unlock",
    title: "Unlock temporarily",
    description: (
      <>
        Only the selected sandbox becomes
        <br className="hidden tablet:block" />
        available for the session.
      </>
    ),
    state: "Access open",
  },
  {
    number: "03",
    name: "Run",
    title: "Run the process",
    description: (
      <>
        The process operates using only
        <br className="hidden tablet:block" />
        the funds available in its sandbox.
      </>
    ),
    state: "Process active",
  },
  {
    number: "04",
    name: "Lock",
    title: "Lock again",
    description: (
      <>
        When the session ends, the sandbox
        <br className="hidden tablet:block" />
        is locked again.
      </>
    ),
    state: "Access closed",
  },
];

function StageMarker({
  index,
  activeStep,
  direction,
}: {
  index: number;
  activeStep: number;
  direction: "horizontal" | "vertical";
}) {
  const step = steps[index];
  const active = activeStep === index;
  const complete = activeStep > index;

  return (
    <div
      className={`relative z-10 flex ${
        direction === "horizontal"
          ? "flex-1 flex-col items-center text-center"
          : "min-h-0 flex-1 items-center gap-3"
      }`}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[0.5625rem] transition-[color,background-color,border-color,box-shadow] duration-500 ease-ration ${
          active
            ? "border-ration-orange bg-ration-orange text-white shadow-[0_0_0_5px_rgb(247_79_6/0.13)]"
            : complete
              ? "border-white/70 bg-ration-dark text-white"
              : "border-white/20 bg-ration-dark text-white/35"
        }`}
      >
        {step.number}
      </span>
      <div className={direction === "horizontal" ? "mt-5" : "min-w-0"}>
        <p
          className={`font-mono text-[0.625rem] font-semibold tracking-[0.16em] uppercase transition-colors duration-500 ${
            active ? "text-ration-orange-light" : "text-white/50"
          }`}
        >
          {step.name}
        </p>
        <p
          className={`mt-1.5 font-mono text-[0.5rem] tracking-[0.08em] uppercase transition-colors duration-500 ${
            active ? "text-white/65" : "text-white/20"
          }`}
        >
          {step.state}
        </p>
      </div>
    </div>
  );
}

function Lifecycle({ activeStep }: { activeStep: number }) {
  const progress = `${(activeStep / (steps.length - 1)) * 100}%`;
  const verticalProgress = `${((activeStep + 0.5) / steps.length) * 100}%`;

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
      <div className="flex h-12 items-center justify-between border-b border-white/10 px-4 mobile:px-5">
        <span className="font-mono text-[0.5625rem] tracking-[0.14em] text-white/35 uppercase">
          Lifecycle / 04
        </span>
        <span className="flex items-center gap-2 font-mono text-[0.5625rem] tracking-[0.12em] text-ration-orange-light uppercase">
          <span className="size-1.5 animate-pulse rounded-full bg-ration-orange" />
          In sequence
        </span>
      </div>

      <div className="relative flex h-[calc(100%-3rem)] flex-col px-3 py-8 mobile:px-5 desktop:hidden">
        <div className="absolute top-8 bottom-8 left-[1.62rem] w-px bg-white/10 mobile:left-[2.12rem]">
          <span
            className="block w-full bg-ration-orange transition-[height] duration-500 ease-ration"
            style={{ height: verticalProgress }}
          />
        </div>
        {steps.map((step, index) => (
          <StageMarker
            key={step.number}
            index={index}
            activeStep={activeStep}
            direction="vertical"
          />
        ))}
      </div>

      <div className="relative hidden h-[calc(100%-3rem)] items-center px-9 desktop:flex">
        <div className="absolute right-[12.5%] left-[12.5%] h-px bg-white/10">
          <span
            className="block h-full bg-ration-orange transition-[width] duration-500 ease-ration"
            style={{ width: progress }}
          />
        </div>
        {steps.map((step, index) => (
          <StageMarker
            key={step.number}
            index={index}
            activeStep={activeStep}
            direction="horizontal"
          />
        ))}
      </div>
    </div>
  );
}

export function HowItWorks() {
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries.find((entry) => entry.isIntersecting);
        if (!current) return;

        setActiveStep(Number((current.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-42% 0px -42% 0px" },
    );

    stepRefs.current.forEach((step) => {
      if (step) observer.observe(step);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="how-it-works"
      className="border-t border-white/10 bg-ration-dark px-gutter py-section text-white"
      aria-labelledby="how-it-works-title"
    >
      <div className="mx-auto max-w-content">
        <p className="mb-6 flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.17em] text-ration-orange-light uppercase mobile:text-xs">
          <span className="h-px w-8 bg-ration-orange" aria-hidden="true" />
          How it works
        </p>
        <h2
          id="how-it-works-title"
          className="max-w-[14ch] text-[clamp(2.75rem,6.5vw,5.75rem)] leading-[0.95] font-semibold tracking-[-0.06em]"
        >
          From funds to process
          <br />
          <span className="text-white/38">in four explicit steps.</span>
        </h2>

        <div className="mt-16 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 mobile:grid-cols-[7.5rem_minmax(0,1fr)] mobile:gap-6 tablet:mt-20 desktop:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.72fr)] desktop:gap-16">
          <aside className="sticky top-20 h-[calc(100dvh-6.5rem)] self-start desktop:top-24 desktop:h-[calc(100dvh-8rem)]">
            <Lifecycle activeStep={activeStep} />
          </aside>

          <div>
            {steps.map((step, index) => {
              const active = activeStep === index;

              return (
                <article
                  key={step.number}
                  ref={(element) => {
                    stepRefs.current[index] = element;
                  }}
                  data-step={index}
                  className="flex min-h-[62dvh] items-center py-8 desktop:min-h-[58dvh]"
                  aria-current={active ? "step" : undefined}
                >
                  <div
                    className={`w-full border-l px-4 py-2 transition-[border-color,opacity,transform] duration-500 ease-ration mobile:px-6 desktop:px-8 ${
                      active
                        ? "translate-x-0 border-ration-orange opacity-100"
                        : "translate-x-1 border-white/10 opacity-35"
                    }`}
                  >
                    <div className="mb-6 flex items-center justify-between gap-3 font-mono text-[0.625rem] tracking-[0.14em] uppercase">
                      <span className={active ? "text-ration-orange-light" : "text-white/45"}>
                        {step.number} / {step.name}
                      </span>
                      <span className="hidden text-white/25 mobile:block">
                        {active ? "Active" : "Standby"}
                      </span>
                    </div>
                    <h3 className="max-w-[13ch] text-[clamp(1.75rem,4vw,3rem)] leading-[1.02] font-semibold tracking-[-0.045em]">
                      {step.title}
                    </h3>
                    <p className="mt-5 text-xs leading-5 text-white/55 mobile:text-sm mobile:leading-6">
                      {step.description}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
