export const rationConfig = {
  name: "Ration",
  description:
    "Disposable financial sandboxes for AI agents, built with Tether WDK.",
  colors: {
    primary: "#F74F06",
    primaryDark: "#D94100",
    primaryLight: "#FF6A2A",
    dark: "#1C1C1C",
    darkSoft: "#252525",
    background: "#F7F7F5",
    white: "#FFFFFF",
    muted: "#777777",
  },
  typography: {
    sans: "var(--font-geist-sans)",
    mono: "var(--font-geist-mono)",
  },
  spacing: {
    section: "clamp(5rem, 10vw, 9rem)",
    gutter: "clamp(1.25rem, 4vw, 3rem)",
    content: "80rem",
  },
  radius: {
    small: "0.375rem",
    medium: "0.75rem",
    large: "1.25rem",
  },
  shadows: {
    card: "0 1px 2px rgb(28 28 28 / 0.06)",
    raised: "0 12px 32px rgb(28 28 28 / 0.08)",
  },
  transitions: {
    fast: "150ms",
    base: "220ms",
    slow: "500ms",
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  animations: {
    fadeIn: "ration-fade-in",
    fadeUp: "ration-fade-up",
    cursorBlink: "ration-cursor-blink",
  },
  breakpoints: {
    mobile: "30rem",
    tablet: "48rem",
    desktop: "64rem",
    wide: "90rem",
  },
} as const;
