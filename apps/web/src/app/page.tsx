import { AgentsSection } from "@/components/agents-section";
import { ArchitectureSection } from "@/components/architecture-section";
import { CliSection } from "@/components/cli-section";
import { CtaSection } from "@/components/cta-section";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Navbar } from "@/components/navbar";
import { ProblemSection } from "@/components/problem-section";
import { SecurityPrinciples } from "@/components/security-principles";

export default function Home() {
  return (
    <>
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-sm bg-ration-orange px-4 py-2 font-mono text-xs font-semibold text-ration-dark transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-ration-orange"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <ProblemSection />
        <HowItWorks />
        <AgentsSection />
        <ArchitectureSection />
        <CliSection />
        <SecurityPrinciples />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
