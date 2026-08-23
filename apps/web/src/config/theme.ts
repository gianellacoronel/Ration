export const themeConfig = {
  defaultTheme: "dark",
  storageKey: "ration-theme",
  themes: ["dark", "light"],
} as const;

export type Theme = (typeof themeConfig.themes)[number];
