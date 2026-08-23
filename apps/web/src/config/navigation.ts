export const navigation = [
  {
    label: "Product",
    href: "#product",
  },
  {
    label: "How it works",
    href: "#how-it-works",
  },
  {
    label: "CLI",
    href: "#cli",
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
