import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { ProblemSection } from "@/components/problem-section";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
      </main>
    </>
  );
}
