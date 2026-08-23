import Link from "next/link";

import { footerNavigation } from "@/config/navigation";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ration-dark px-gutter py-10 text-white mobile:py-12">
      <div className="mx-auto grid max-w-content gap-10 tablet:grid-cols-[1fr_auto] tablet:items-start">
        <div>
          <Link
            href="/"
            className="inline-block rounded-sm text-xl font-semibold tracking-[-0.04em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange"
            aria-label="Ration home"
          >
            Ration
          </Link>
          <p className="mt-4 text-sm leading-6 text-white/65">
            Financial sandboxes for processes.
          </p>
        </div>

        <nav aria-label="Footer navigation">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-4 mobile:flex mobile:flex-wrap mobile:justify-end mobile:gap-x-7">
            {footerNavigation.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="rounded-sm text-sm font-medium text-white/55 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange"
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="border-t border-white/10 pt-6 font-mono text-[0.625rem] tracking-[0.12em] text-white/55 tablet:col-span-2 tablet:mt-3">
          © 2026 Ration
        </p>
      </div>
    </footer>
  );
}
