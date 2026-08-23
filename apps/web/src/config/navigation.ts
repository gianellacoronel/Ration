export const navigation = [
  {
    label: "The problem",
    href: "#problem",
  },
  {
    label: "The model",
    href: "#ration",
  },
  {
    label: "Use cases",
    href: "#use-cases",
  },
  {
    label: "Docs",
    href: rationConfig.docsUrl,
  },
] as const;

export const getStartedHref = "#cli";

export const githubHref = rationConfig.githubUrl;

export const footerNavigation = [
  ...navigation,
  {
    label: "GitHub",
    href: githubHref,
  },
] as const;
import { rationConfig } from "@/config/ration";
