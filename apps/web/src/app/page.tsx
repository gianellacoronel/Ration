import { AgentsSection } from "@/components/agents-section";
import { CliSection } from "@/components/cli-section";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Navbar } from "@/components/navbar";
import { ProblemSection } from "@/components/problem-section";
import { SecurityPrinciples } from "@/components/security-principles";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <HowItWorks />
        <CliSection />
        <AgentsSection />
        <SecurityPrinciples />
      </main>
    </>
  );
}
