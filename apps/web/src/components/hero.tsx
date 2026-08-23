import { Bot, Coins, LockKeyhole, Terminal } from "lucide-react";
import Image from "next/image";

import { InstallCommand } from "@/components/install-command";
import { TerminalDemo } from "@/components/terminal-demo";

export function Hero() {
  return (
    <section className="overflow-hidden border-b" aria-labelledby="hero-title">
      <div className="mx-auto max-w-content px-gutter py-12 tablet:py-16 desktop:py-14 wide:flex wide:min-h-[calc(100svh-4.5rem)] wide:items-center wide:py-10">
        <div className="relative grid w-full gap-y-10 tablet:gap-y-12 desktop:grid-cols-[minmax(19rem,0.82fr)_minmax(30rem,1.18fr)] desktop:items-center desktop:gap-x-[clamp(4rem,7vw,7rem)]">
          <div className="relative z-10 min-w-0 [container-type:inline-size]">
            <div className="mb-7 flex w-fit items-center gap-3 border-l-2 border-ration-orange pl-3">
              <span className="font-mono text-[0.6rem] font-medium uppercase tracking-[0.14em] text-muted">
                Built with
              </span>
              <Image
                src="/wdk-logo-dark.png"
                alt="Tether WDK"
                width={142}
                height={51}
                className="h-auto w-28 mobile:w-32"
                priority
              />
            </div>
            <h1 id="hero-title" className="display-type text-[clamp(2.75rem,18cqw,8rem)] leading-[0.82] text-foreground desktop:text-[clamp(4rem,21cqw,7.5rem)] desktop:leading-[0.84]">
              <span className="block whitespace-nowrap">Give</span>
              <span className="block whitespace-nowrap">Every</span>
              <span className="block whitespace-nowrap">Process</span>
              <span className="block whitespace-nowrap text-ration-orange">It&apos;s own</span>
              <span className="block whitespace-nowrap text-ration-orange">Money</span>
            </h1>
            <p className="hand-type mt-6 rotate-[-2deg] text-[clamp(1.7rem,3vw,2.5rem)] leading-none text-foreground wide:text-[2rem]">
              Give agents a ration, not your wallet.
            </p>
            <div className="mt-9">
              <InstallCommand />
            </div>
          </div>

          <div className="relative min-w-0">
            <div className="pointer-events-none absolute inset-0 z-20 hidden wide:block" aria-hidden="true">
              <Coins className="absolute -right-4 top-24 rotate-12 text-ration-orange" size={48} strokeWidth={1.7} />
              <Bot className="absolute top-[44%] -left-9 rotate-3 text-foreground" size={54} strokeWidth={1.5} />
              <Terminal className="absolute -bottom-7 left-14 rotate-[-5deg] text-foreground" size={58} strokeWidth={1.5} />
              <LockKeyhole className="absolute right-8 -bottom-5 text-ration-orange" size={34} strokeWidth={1.8} />
            </div>
            <div className="relative z-10">
              <TerminalDemo />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
