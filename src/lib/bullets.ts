import type { Bullet } from "./profile";

/**
 * Bullet bank drawn from verified work history. The tailoring engine selects and
 * orders from this bank per job — it never invents new claims.
 *
 * Replace the bracketed metrics with your real numbers before sending anything out.
 */
export const BULLETS: Bullet[] = [
  {
    id: "airflow-multiregion",
    role: "Deltek",
    text: "Led multi-region Apache Airflow upgrades across US-East-1, US-East-2 and EU-Central-1, coordinating rollout across [N] environments with zero customer-facing downtime.",
    tags: ["orchestration", "cloud", "platform", "leadership"],
  },
  {
    id: "eks-upgrade",
    role: "Deltek",
    text: "Drove EKS cluster upgrades from 1.31 to 1.32 across production regions, sequencing node-group migrations and validating workload compatibility ahead of cutover.",
    tags: ["cloud", "platform", "practices"],
  },
  {
    id: "middleware-platform",
    role: "Deltek",
    text: "Architected and led the Self-Service Middleware / Integration Platform API, letting customers configure their own integrations instead of filing engineering requests.",
    tags: ["platform", "integrations", "leadership", "web"],
  },
  {
    id: "successfactors",
    role: "Deltek",
    text: "Owned the SAP SuccessFactors integration suite for ~2 years, covering employee, org and payroll data flows for enterprise HR customers.",
    tags: ["integrations", "orchestration"],
  },
  {
    id: "client-onboarding",
    role: "Deltek",
    text: "Onboarded 14+ named enterprise clients — including PwC, DXC, Technicolor, Capgemini, Domino's and Adtalem — from integration design through production cutover.",
    tags: ["integrations", "leadership", "platform"],
  },
  {
    id: "fips",
    role: "Deltek",
    text: "Drove a FIPS 140-2 compliance initiative across the integration stack, auditing cryptographic dependencies and remediating non-compliant libraries.",
    tags: ["practices", "cloud", "leadership"],
  },
  {
    id: "custom-operators",
    role: "Deltek",
    text: "Built reusable Airflow custom operators and hooks that cut new-connector delivery from [N] weeks to [N] days for the integrations team.",
    tags: ["orchestration", "languages", "platform"],
  },
  {
    id: "oauth",
    role: "Deltek",
    text: "Implemented OAuth2 and token-refresh flows for third-party ERP and CRM connectors, replacing brittle credential handling with a shared auth layer.",
    tags: ["integrations", "practices"],
  },
  {
    id: "aurora-boto3",
    role: "Deltek",
    text: "Automated AWS infrastructure operations with Python and Boto3 against Aurora and S3, replacing manual runbooks with idempotent scripts.",
    tags: ["cloud", "languages", "practices"],
  },
  {
    id: "mentoring",
    role: "Deltek",
    text: "Mentored [N] engineers through design reviews and integration onboarding, and set the review standards the team now uses for new connectors.",
    tags: ["leadership", "practices"],
  },
  {
    id: "replicon-etl",
    role: "Replicon",
    text: "Built and maintained ETL pipelines and REST integrations for time-and-attendance data, serving [N] enterprise tenants.",
    tags: ["orchestration", "integrations", "languages"],
  },
  {
    id: "replicon-salesforce",
    role: "Replicon",
    text: "Delivered Salesforce and QuickBooks connectors, handling schema mapping, rate limits and partial-failure retries.",
    tags: ["integrations", "languages"],
  },
  {
    id: "replicon-perf",
    role: "Replicon",
    text: "Cut sync job runtime by [N]% by profiling hot paths and moving bulk operations to batched, paginated API calls.",
    tags: ["languages", "practices", "platform"],
  },
];

export const PROJECT_BULLETS: Bullet[] = [
  {
    id: "proj-autopilot",
    role: "Apply Pilot",
    text: "Next.js + TypeScript dashboard that aggregates job postings, scores them against a skill profile, and auto-tailors an ATS-optimized LaTeX resume per role.",
    tags: ["web", "languages", "platform"],
  },
];
