import Link from "next/link";

import { footerNavigation } from "@/config/navigation";

export function Footer() {
  return (
    <footer className="border-t bg-ration-dark px-gutter py-10 text-ration-cream">
      <div className="mx-auto grid max-w-content gap-9 tablet:grid-cols-[1fr_auto] tablet:items-end">
        <div><Link href="/" className="display-type text-2xl">Ration<span className="text-ration-orange">/</span></Link><p className="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ration-cream/55">Financial sandboxes for processes.</p></div>
        <nav aria-label="Footer navigation"><ul className="flex flex-wrap gap-x-6 gap-y-3">{footerNavigation.map((item) => <li key={item.label}><a href={item.href} className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-ration-cream/60 hover:text-ration-orange">{item.label}</a></li>)}</ul></nav>
        <p className="border-t border-ration-cream/15 pt-5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ration-cream/45 tablet:col-span-2">© 2026 Ration / built on Tether WDK</p>
      </div>
    </footer>
  );
}
