// Centralized branding config (Section 29 — "avoid hardcoding the brand
// name throughout the codebase"). "DataHive" is a working name; changing
// the product name means editing this file only.
export const brand = {
  name: "DataHive",
  tagline: "Complex projects need more than one expert.",
  logoInitial: "D",
  supportEmail: "support@datahive.example",
  social: {
    twitter: "https://twitter.com/datahive",
    linkedin: "https://linkedin.com/company/datahive",
  },
} as const;
