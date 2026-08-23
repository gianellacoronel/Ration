"use client";

import { useEffect, useRef, useState } from "react";

const agents = [
  { name: "Agent A", amount: "$5 USDT", sandbox: "Sandbox A" },
  { name: "Agent B", amount: "$10 USDT", sandbox: "Sandbox B" },
] as const;

export function AgentsSection() {
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
      id="agents"
      className="overflow-hidden border-t border-ration-dark/10 bg-ration-background px-gutter py-section"
      aria-labelledby="agents-title"
    >
      <div className="mx-auto max-w-content">
        <div className="grid gap-12 desktop:grid-cols-[minmax(20rem,0.8fr)_minmax(30rem,1.2fr)] desktop:items-center desktop:gap-20">
          <div>
            <p className="mb-6 flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.17em] text-ration-orange uppercase mobile:text-xs">
              <span className="h-px w-8 bg-ration-orange" aria-hidden="true" />
              Agents
            </p>
            <h2
              id="agents-title"
              className="max-w-[11ch] text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.06em] text-ration-dark"
            >
              Agents need money.
              <br />
              <span className="text-ration-orange">
                Agents shouldn&apos;t own your wallet.
              </span>
            </h2>
            <p className="mt-8 max-w-[28rem] text-base leading-7 text-ration-dark/65 mobile:text-lg mobile:leading-8">
              Give an agent the funds it needs,
              <br className="hidden mobile:block" /> without giving it your entire
              wallet.
            </p>
          </div>

          <div
            className={`motion-reveal agents-diagram rounded-lg border border-ration-dark/12 bg-white shadow-[0_24px_70px_rgb(28_28_28/0.1)] transition-[opacity,transform] duration-500 ease-ration ${
              visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            role="img"
            aria-label="Ration allocates separate amounts to Agent A and Agent B through isolated sandboxes"
          >
            <div className="flex items-center justify-between border-b border-ration-dark/10 px-5 py-4 mobile:px-7">
              <span className="font-mono text-[0.625rem] tracking-[0.14em] text-ration-dark/60 uppercase">
                Allocation map
              </span>
              <span className="flex items-center gap-2 font-mono text-[0.5625rem] tracking-[0.12em] text-ration-orange uppercase">
                <span className="size-1.5 rounded-full bg-ration-orange" aria-hidden="true" />
                Explicit funds
              </span>
            </div>

            <div className="px-4 py-10 mobile:px-8 mobile:py-12">
              <div
                className={`mx-auto flex h-16 w-40 items-center justify-center rounded-md border border-ration-orange/40 bg-ration-orange font-mono text-xs font-semibold tracking-[0.09em] text-white uppercase transition-[opacity,transform] duration-500 ease-ration ${
                  visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
                }`}
              >
                Ration
              </div>

              <div
                className={`agent-connection mx-auto h-9 w-px origin-top transition-transform duration-500 ease-ration ${
                  visible ? "scale-y-100" : "scale-y-0"
                }`}
                style={{ transitionDelay: "120ms" }}
                aria-hidden="true"
              />

              <div
                className={`relative mx-auto max-w-[30rem] transition-[opacity,transform] duration-500 ease-ration ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
                style={{ transitionDelay: "240ms" }}
              >
                <div className="agent-connection agent-connection-horizontal absolute top-0 right-[25%] left-[25%] h-px" aria-hidden="true" />
                <div className="grid grid-cols-2 gap-3 pt-8 mobile:gap-8">
                  {agents.map((agent) => (
                    <div className="relative flex min-w-0 flex-col items-center" key={agent.name}>
                      <span className="agent-connection absolute -top-8 left-1/2 h-8 w-px -translate-x-1/2" aria-hidden="true" />
                      <div className="flex min-h-14 w-full items-center justify-center rounded-md border border-ration-dark/12 bg-ration-background px-2 font-mono text-[0.6875rem] font-semibold tracking-[0.04em] text-ration-dark mobile:text-xs">
                        {agent.name}
                      </div>
                      <div className="agent-connection h-8 w-px" aria-hidden="true" />
                      <span className="relative z-10 rounded-full border border-ration-orange/25 bg-white px-2.5 py-1 font-mono text-[0.5625rem] font-semibold tracking-[0.04em] text-ration-orange-dark mobile:px-3 mobile:text-[0.625rem]">
                        {agent.amount}
                      </span>
                      <div className="agent-connection h-8 w-px" aria-hidden="true" />
                      <div className="flex min-h-16 w-full items-center justify-center rounded-md border border-ration-orange/35 bg-ration-orange/[0.07] px-2 font-mono text-[0.625rem] font-semibold tracking-[0.04em] text-ration-orange-dark mobile:text-[0.6875rem]">
                        {agent.sandbox}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 border-t border-ration-dark/10 bg-ration-background/65 px-3 py-4 font-mono text-[0.5625rem] tracking-[0.08em] text-ration-dark/60 uppercase mobile:gap-3 mobile:px-4 mobile:tracking-[0.12em]">
              <span>Ration</span>
              <span className="text-ration-orange" aria-hidden="true">↓</span>
              <span>Sandbox</span>
              <span className="text-ration-orange" aria-hidden="true">↓</span>
              <span>Agent</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
