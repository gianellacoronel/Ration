"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getStartedHref, navigation } from "@/config/navigation";

const linkStyles =
  "font-mono text-xs uppercase tracking-[0.08em] text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setIsOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [isOpen]);

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex h-18 max-w-content items-center justify-between px-gutter">
        <Link
          href="/"
          className="display-type text-xl text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange"
          aria-label="Ration home"
        >
          Ration<span className="text-ration-orange">/</span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden tablet:block">
          <ul className="flex items-center gap-7 desktop:gap-10">
            {navigation.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={linkStyles}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={getStartedHref}
            className="hidden min-h-10 items-center gap-2 border px-3 font-mono text-xs uppercase tracking-[0.08em] text-foreground transition-colors hover:border-ration-orange hover:text-ration-orange mobile:flex"
          >
            Run CLI <ArrowRight size={17} strokeWidth={1.8} />
          </a>
          <button
            type="button"
            className="flex size-10 cursor-pointer items-center justify-center border text-foreground tablet:hidden"
            aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>

      <nav
        id="mobile-navigation"
        aria-label="Mobile navigation"
        aria-hidden={!isOpen}
        className={`absolute inset-x-0 top-full border-b bg-background px-gutter transition-[opacity,transform] tablet:hidden ${isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}
      >
        <ul className="py-4">
          {navigation.map((item) => (
            <li key={item.href} className="border-b last:border-0">
              <a
                href={item.href}
                className={`${linkStyles} block py-4`}
                tabIndex={isOpen ? 0 : -1}
                onClick={() => setIsOpen(false)}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel={item.href.startsWith("http") ? "noreferrer" : undefined}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
