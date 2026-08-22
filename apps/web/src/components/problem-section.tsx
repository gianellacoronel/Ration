"use client";

import { useEffect, useRef, useState } from "react";

const traditionalProcesses = ["Agent", "Script", "CLI", "Automation", "Other"];
const rationProcesses = ["A", "B", "C"];

function WalletNode({ accent = false }: { accent?: boolean }) {
  return (
    <div
      className={`mx-auto flex h-16 w-40 items-center justify-center rounded-md border font-mono text-xs font-semibold tracking-[0.08em] uppercase shadow-card ${
        accent
          ? "border-ration-orange/40 bg-ration-orange text-white"
          : "border-ration-dark/15 bg-white text-ration-dark"
      }`}
    >
      Main Wallet
    </div>
  );
}

function TraditionalDiagram({ visible }: { visible: boolean }) {
  return (
    <div className="flex min-h-[20rem] flex-col justify-center px-4 py-9 mobile:px-7">
      <div
        className={`transition-[opacity,transform] duration-500 ease-ration ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        }`}
      >
        <WalletNode />
      </div>

      <div
        className={`mx-auto h-10 w-px origin-top bg-ration-dark/20 transition-transform duration-500 ease-ration ${
          visible ? "scale-y-100" : "scale-y-0"
        }`}
        style={{ transitionDelay: "160ms" }}
        aria-hidden="true"
      />

      <div
        className={`relative transition-[opacity,transform] duration-500 ease-ration ${
          visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
        style={{ transitionDelay: "280ms" }}
      >
        <div
          className="absolute top-0 right-[8%] left-[8%] h-px bg-ration-dark/20"
          aria-hidden="true"
        />
        <div className="grid grid-cols-5 gap-1.5 pt-7 mobile:gap-2.5">
          {traditionalProcesses.map((process) => (
            <div className="relative" key={process}>
              <span
                className="absolute -top-7 left-1/2 h-7 w-px -translate-x-1/2 bg-ration-dark/20"
                aria-hidden="true"
              />
              <div className="flex min-h-14 items-center justify-center rounded-sm border border-ration-dark/10 bg-ration-background px-1.5 text-center font-mono text-[0.5625rem] leading-4 text-ration-dark/65 mobile:text-[0.625rem]">
                {process}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RationDiagram({ visible }: { visible: boolean }) {
  return (
    <div className="flex min-h-[20rem] flex-col justify-center px-4 py-9 mobile:px-7">
      <div
        className={`transition-[opacity,transform] duration-500 ease-ration ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        }`}
      >
        <WalletNode accent />
      </div>

      <div
        className={`mx-auto h-9 w-px origin-top bg-ration-orange transition-transform duration-500 ease-ration ${
          visible ? "scale-y-100" : "scale-y-0"
        }`}
        style={{ transitionDelay: "160ms" }}
        aria-hidden="true"
      />

      <div
        className={`relative transition-[opacity,transform] duration-500 ease-ration ${
          visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
        style={{ transitionDelay: "280ms" }}
      >
        <div
          className="absolute top-0 right-[15%] left-[15%] h-px bg-ration-orange/60"
          aria-hidden="true"
        />
        <div className="grid grid-cols-3 gap-2.5 pt-7 mobile:gap-4">
          {rationProcesses.map((process) => (
            <div className="relative" key={process}>
              <span
                className="absolute -top-7 left-1/2 h-7 w-px -translate-x-1/2 bg-ration-orange/60"
                aria-hidden="true"
              />
              <div className="flex min-h-14 items-center justify-center rounded-sm border border-ration-orange/40 bg-ration-orange/[0.07] px-2 text-center font-mono text-[0.625rem] font-semibold tracking-[0.04em] text-ration-orange-dark mobile:text-[0.6875rem]">
                Sandbox {process}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`grid grid-cols-3 gap-2.5 transition-[opacity,transform] duration-500 ease-ration mobile:gap-4 ${
          visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
        style={{ transitionDelay: "440ms" }}
      >
        {rationProcesses.map((process) => (
          <div className="relative pt-7" key={process}>
            <span
              className="absolute top-0 left-1/2 h-7 w-px -translate-x-1/2 bg-ration-orange/60"
              aria-hidden="true"
            />
            <div className="flex min-h-11 items-center justify-center rounded-sm bg-ration-dark px-1.5 text-center font-mono text-[0.5625rem] text-white/80 mobile:text-[0.625rem]">
              Process {process}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProblemSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.2 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="product"
      className="border-t border-ration-dark/10 px-gutter py-section"
      aria-labelledby="problem-title"
    >
      <div className="mx-auto max-w-content">
        <div className="mb-12 grid gap-6 tablet:mb-16 tablet:grid-cols-[1fr_auto] tablet:items-end">
          <div>
            <p className="mb-6 flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.17em] text-ration-orange uppercase mobile:text-xs">
              <span className="h-px w-8 bg-ration-orange" aria-hidden="true" />
              The problem
            </p>
            <h2
              id="problem-title"
              className="max-w-[13ch] text-[clamp(2.75rem,6.5vw,5.75rem)] leading-[0.95] font-semibold tracking-[-0.06em] text-ration-dark"
            >
              Your wallet shouldn&apos;t be
              <br />
              <span className="text-ration-orange">your process&apos;s wallet.</span>
            </h2>
          </div>
          <p className="max-w-[24rem] border-l border-ration-dark/15 pl-5 text-sm leading-6 text-ration-dark/55 tablet:mb-1">
            Separate process access from your main wallet with purpose-built,
            temporary sandboxes.
          </p>
        </div>

        <div className="grid gap-5 desktop:grid-cols-2">
          <article className="overflow-hidden rounded-lg border border-ration-dark/12 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-ration-dark/10 px-5 py-4 mobile:px-7">
              <h3 className="text-sm font-semibold tracking-[-0.01em] text-ration-dark">
                Traditional
              </h3>
              <span className="font-mono text-[0.625rem] tracking-[0.12em] text-ration-dark/35 uppercase">
                Shared access
              </span>
            </div>
            <TraditionalDiagram visible={visible} />
            <p className="border-t border-ration-dark/10 px-5 py-6 text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-ration-dark mobile:px-7">
              One wallet.
              <br />
              Many processes.
              <br />
              <span className="text-ration-dark/40">Shared risk.</span>
            </p>
          </article>

          <article className="overflow-hidden rounded-lg border border-ration-orange/30 bg-white shadow-[0_14px_40px_rgb(247_79_6/0.08)]">
            <div className="flex items-center justify-between border-b border-ration-orange/20 bg-ration-orange/[0.04] px-5 py-4 mobile:px-7">
              <h3 className="text-sm font-semibold tracking-[-0.01em] text-ration-orange-dark">
                Ration
              </h3>
              <span className="font-mono text-[0.625rem] tracking-[0.12em] text-ration-orange/65 uppercase">
                Isolated access
              </span>
            </div>
            <RationDiagram visible={visible} />
            <p className="border-t border-ration-orange/20 bg-ration-orange/[0.04] px-5 py-6 text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-ration-dark mobile:px-7">
              Isolated funds.
              <br />
              Temporary access.
              <br />
              <span className="text-ration-orange">Explicit control.</span>
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
