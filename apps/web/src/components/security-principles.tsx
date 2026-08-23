"use client";

import { useEffect, useRef, useState } from "react";

const principles = [
  {
    number: "01",
    title: "Isolated",
    description: "Each process gets its own wallet boundary.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Temporary",
    description: "Access exists only for the required session.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 3h8M8 21h8M9 3v3.2c0 1.1.55 2.13 1.47 2.74L12 10l1.53-1.06A3.32 3.32 0 0 0 15 6.2V3M9 21v-3.2c0-1.1.55-2.13 1.47-2.74L12 14l1.53 1.06A3.32 3.32 0 0 1 15 17.8V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Explicit",
    description: "Funding is intentional and user-controlled.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 7h14M5 17h14M9 4v6M15 14v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="7" r="2" fill="currentColor" />
        <circle cx="15" cy="17" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Disposable",
    description: "Sandboxes are designed for isolated workloads.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 8h10M9 8V5h6v3M8 8l.7 11h6.6L16 8M10.5 11v5M13.5 11v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const;

export function SecurityPrinciples() {
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
      { threshold: 0.15 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="security"
      className="border-t border-white/10 bg-ration-dark px-gutter py-section text-white"
      aria-labelledby="security-title"
    >
      <div className="mx-auto max-w-content">
        <div className="grid gap-7 tablet:grid-cols-[minmax(0,1fr)_minmax(16rem,0.5fr)] tablet:items-end">
          <div>
            <p className="mb-6 flex items-center gap-3 text-[0.6875rem] font-bold tracking-[0.17em] text-ration-orange-light uppercase mobile:text-xs">
              <span className="h-px w-8 bg-ration-orange" aria-hidden="true" />
              Security principles
            </p>
            <h2
              id="security-title"
              className="max-w-[12ch] text-[clamp(2.75rem,6.5vw,5.75rem)] leading-[0.95] font-semibold tracking-[-0.06em]"
            >
              Designed around
              <br />
              <span className="text-white/38">clear boundaries.</span>
            </h2>
          </div>
          <p className="border-l border-white/15 pl-5 text-sm leading-6 text-white/65 tablet:mb-1">
            Practical constraints for processes that need access to real funds.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 tablet:mt-20 tablet:grid-cols-2 desktop:grid-cols-4">
          {principles.map((principle, index) => (
            <article
              key={principle.number}
              className={`motion-reveal group min-h-[19rem] bg-ration-dark-soft p-6 transition-[opacity,transform,background-color] duration-500 ease-ration hover:bg-ration-dark-raised mobile:p-8 ${
                visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: `${index * 110}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-mono text-[0.625rem] tracking-[0.14em] text-white/55">
                  {principle.number} / 04
                </span>
                <span className="flex size-10 items-center justify-center rounded-md border border-white/10 text-ration-orange-light transition-[border-color,background-color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:border-ration-orange/35 group-hover:bg-ration-orange/10 [&>svg]:size-5">
                  {principle.icon}
                </span>
              </div>
              <div className="mt-20">
                <h3 className="text-[clamp(1.6rem,2.5vw,2.15rem)] leading-none font-semibold tracking-[-0.04em]">
                  {principle.title}
                </h3>
                <p className="mt-5 max-w-[17rem] text-sm leading-6 text-white/65">
                  {principle.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
