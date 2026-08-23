"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { getStartedHref, navigation } from "@/config/navigation";

const linkStyles =
  "rounded-sm text-sm font-medium text-ration-dark/70 transition-colors hover:text-ration-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange";

const ctaStyles =
  "inline-flex items-center justify-center rounded-sm bg-ration-orange px-5 py-2.5 text-sm font-semibold text-ration-white transition-colors hover:bg-ration-orange-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    firstLinkRef.current?.focus();

    const closeAtDesktop = window.matchMedia("(min-width: 48rem)");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) setIsOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    closeAtDesktop.addEventListener("change", handleDesktopChange);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      closeAtDesktop.removeEventListener("change", handleDesktopChange);
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <header
      ref={headerRef}
      className="relative z-50 border-b border-ration-dark/10 bg-ration-background"
    >
      <div className="mx-auto flex h-20 max-w-content items-center justify-between px-gutter tablet:grid tablet:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="w-fit rounded-sm text-xl font-semibold tracking-[-0.04em] text-ration-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ration-orange"
          aria-label="Ration home"
        >
          Ration
        </Link>

        <nav aria-label="Primary navigation" className="hidden tablet:block">
          <ul className="flex items-center gap-8 desktop:gap-10">
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

        <a
          href={getStartedHref}
          className={`${ctaStyles} hidden justify-self-end tablet:inline-flex`}
        >
          Get started
        </a>

        <button
          ref={toggleRef}
          type="button"
          className="relative flex size-11 items-center justify-center rounded-sm text-ration-dark transition-colors hover:bg-ration-dark/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ration-orange tablet:hidden"
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="sr-only">{isOpen ? "Close menu" : "Open menu"}</span>
          <span aria-hidden="true" className="relative block h-4 w-5">
            <span
              className={`absolute left-0 top-0 block h-0.5 w-5 bg-current transition-transform ${isOpen ? "translate-y-[7px] rotate-45" : ""}`}
            />
            <span
              className={`absolute left-0 top-[7px] block h-0.5 w-5 bg-current transition-opacity ${isOpen ? "opacity-0" : ""}`}
            />
            <span
              className={`absolute bottom-0 left-0 block h-0.5 w-5 bg-current transition-transform ${isOpen ? "-translate-y-[7px] -rotate-45" : ""}`}
            />
          </span>
        </button>
      </div>

      <div
        id="mobile-navigation"
        aria-hidden={!isOpen}
        className={`absolute inset-x-0 top-full overflow-hidden border-b bg-ration-background transition-[max-height,opacity,transform] duration-300 ease-ration tablet:hidden ${
          isOpen
            ? "max-h-96 translate-y-0 opacity-100"
            : "pointer-events-none max-h-0 -translate-y-2 opacity-0"
        }`}
      >
        <nav aria-label="Mobile navigation" className="px-gutter pb-7 pt-2">
          <ul className="flex flex-col">
            {navigation.map((item, index) => (
              <li key={item.href}>
                <a
                  ref={index === 0 ? firstLinkRef : undefined}
                  href={item.href}
                  className={`${linkStyles} block py-3 text-base`}
                  tabIndex={isOpen ? 0 : -1}
                  onClick={closeMenu}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={getStartedHref}
            className={`${ctaStyles} mt-5 w-full`}
            tabIndex={isOpen ? 0 : -1}
            onClick={closeMenu}
          >
            Get started
          </a>
        </nav>
      </div>
    </header>
  );
}
