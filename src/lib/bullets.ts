import type { Bullet } from "./profile";

/**
 * Bullet bank drawn from verified work history. The tailoring engine selects and
 * orders from this bank per job — it never invents new claims.
 *
 * Every metric here traces to the maintained .tex resume. Do not add a figure
 * that isn't on it: `npm run check:resume` catches bracketed placeholders, but
 * nothing can catch a number that is merely wrong.
 */
export const BULLETS: Bullet[] = [
  {
    id: "airflow-platform-owner",
    role: "Deltek",
    text: "Own the architecture and reliability of a multi-tenant Apache Airflow integration platform serving 14+ enterprise customers (PwC, DXC, Capgemini, Dominos, Technicolor, Frontdoor) across US and EU regions.",
    tags: ["orchestration", "platform", "cloud", "leadership"],
  },
  {
    id: "integration-platform-api",
    role: "Deltek",
    text: "Architected integration-platform-api, a WAF-secured Next.js and PostgreSQL service (40+ endpoints) enabling Deltek product teams to autonomously deploy and manage ERP integrations via Apache Airflow.",
    tags: ["platform", "web", "integrations", "leadership"],
  },
  {
    id: "fips",
    role: "Deltek",
    text: "Drove a platform-wide FIPS 140-2 compliance initiative, delivering a hardened FIPS Docker image, TLS-encrypted webhook transport, FIPS-compliant ALB/ELB endpoints, and vulnerability remediation across the Airflow fleet.",
    tags: ["practices", "cloud", "leadership"],
  },
  {
    id: "aidlc",
    role: "Deltek",
    text: "Authored AIDLC (AI-Driven Development Lifecycle), a Claude Code skill enforcing a structured workflow from requirements and design through code generation, build, and test; adopted across multiple engineering teams, and complemented by an automated Claude Code review bot posting inline pull-request comments.",
    tags: ["practices", "leadership", "languages"],
  },
  {
    id: "airflow-multiregion",
    role: "Deltek",
    text: "Led multi-region Airflow platform upgrades and a zero-downtime EKS cluster migration (1.31 to 1.32) with Helm-based CI/CD changes across three AWS regions, and established Prometheus/Grafana observability for AWS Aurora Serverless and Kubernetes workloads.",
    tags: ["orchestration", "cloud", "platform", "practices", "leadership"],
  },
  {
    id: "oauth-webapp",
    role: "Deltek",
    text: "Spearheaded an OAuth2 React, Node.js, and TypeScript web application on the core platform, integrating Apache Airflow for event-driven ETL with ERP systems including Salesforce and QuickBooks.",
    tags: ["integrations", "web", "languages", "platform"],
  },
  {
    id: "airflow-pipelines",
    role: "Deltek",
    text: "Built and scaled Python data pipelines on Apache Airflow processing 53K+ records/day, reducing processing time by 37% via custom batch operators, and authored a company-wide library of reusable hooks and operators (SQLAlchemy, AWS S3/Boto3, SFTP/Paramiko, REST APIs).",
    tags: ["orchestration", "languages", "cloud", "platform"],
  },
  {
    id: "replicon-ipaas",
    role: "Replicon",
    text: "Piloted a company-wide Integration Platform using Apache Airflow and Kafka hosted on AWS, achieving a 60% cost reduction (averaging USD 2,500 per client) by eliminating third-party iPaaS dependencies.",
    tags: ["orchestration", "cloud", "integrations", "platform", "leadership"],
  },
  {
    id: "successfactors",
    role: "Replicon",
    text: "Owned the SAP SuccessFactors integration suite over ~2 years, delivering payroll data transfer, time-off synchronization, and schedule import, and earning SAP Endorsed App premium certification.",
    tags: ["integrations", "orchestration"],
  },
  {
    id: "replicon-salesforce",
    role: "Replicon",
    text: "Pioneered the Integration Platform team, developing a Salesforce Connected App with Salesforce DX and Node.js for OAuth2 user interaction, leveraging platform events for webhooks published on the Salesforce Marketplace.",
    tags: ["integrations", "languages", "leadership", "web"],
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
