import type { Market } from "./types";

export interface SkillGroup {
  key: string;
  label: string;
  weight: number;
  terms: string[];
}

export interface Bullet {
  id: string;
  role: string;
  text: string;
  tags: string[];
}

/**
 * One title held at a company. Grouped under RoleEntry rather than listed flat,
 * because the renderer emits one bullet list per *company* — a flat list with
 * two Deltek rows made every Deltek bullet print twice, once under each title.
 */
export interface TitleStint {
  title: string;
  start: string;
  end: string;
}

export interface RoleEntry {
  company: string;
  location: string;
  /** Most recent title first. */
  titles: TitleStint[];
}

/**
 * A skills line. `emphasis` lists SKILL_GROUPS keys that float this row toward
 * the top when a posting stresses them; rows without it keep their fixed order.
 */
export interface SkillRow {
  label: string;
  emphasis?: string[];
  items: string[];
}

export interface EducationEntry {
  school: string;
  credential: string;
  location: string;
  start: string;
  end: string;
}

export interface Credential {
  name: string;
  issuer: string;
  date: string;
  url?: string;
}

export interface Award {
  name: string;
  detail: string;
  years: string;
}

/**
 * The shared vocabulary. This drives three things at once: which postings score
 * well (match.ts), which search terms are sent to keyword sources
 * (resumeSearch.ts), and which postings clear the ingest gate (relevance.ts).
 *
 * Every term here must be something PROFILE.skills or the bullet bank actually
 * claims — a term you cannot back up fetches postings you will score well and
 * then fail an interview on.
 *
 * Design-pattern names from PROFILE.skills are deliberately absent. Unlike short
 * acronyms, which hasTerm's word boundaries make safe, "state", "builder",
 * "template", "observer" and "adapter" are ordinary English that survives those
 * boundaries — "state" alone appears in 37 stored postings. As terms they would
 * hand out skill credit for postings with no relation to the pattern.
 */
export const SKILL_GROUPS: SkillGroup[] = [
  {
    key: "orchestration",
    label: "Orchestration & data pipelines",
    weight: 3,
    terms: [
      "airflow",
      "apache airflow",
      "dag",
      "etl",
      "elt",
      "data pipeline",
      "workflow orchestration",
      "batch processing",
      "dagster",
      "prefect",
      "kafka",
    ],
  },
  {
    key: "cloud",
    label: "Cloud & infrastructure",
    weight: 3,
    terms: [
      "aws",
      "eks",
      "kubernetes",
      "k8s",
      "aurora",
      "boto3",
      "s3",
      "lambda",
      "terraform",
      "docker",
      "helm",
      "ecs",
      "cloudformation",
      "ec2",
      "ecr",
      "rds",
      "waf",
      "codepipeline",
      "route 53",
    ],
  },
  {
    key: "languages",
    label: "Languages",
    weight: 3,
    terms: [
      "python",
      "typescript",
      "javascript",
      "sql",
      "go",
      "java",
      "pandas",
      "numpy",
      "sqlalchemy",
    ],
  },
  {
    key: "integrations",
    label: "Integration & iPaaS",
    weight: 3,
    terms: [
      "oauth2",
      "oauth",
      "saml",
      "sso",
      "rest api",
      "webhook",
      "sap",
      "successfactors",
      "salesforce",
      "quickbooks",
      "erp",
      "ipaas",
      "middleware",
      "connector",
      "third-party integration",
      "api integration",
      "graphql",
      "sftp",
      "sap cloud integration",
      "salesforce dx",
      "apex",
      "sap ui5",
      "fiori",
    ],
  },
  {
    key: "platform",
    label: "Platform & architecture",
    weight: 2,
    terms: [
      "microservices",
      "distributed systems",
      "api design",
      "platform engineering",
      "multi-tenant",
      "scalability",
      "system design",
      "event-driven",
    ],
  },
  {
    key: "web",
    label: "Web",
    weight: 2,
    terms: ["next.js", "nextjs", "react", "node.js", "node"],
  },
  {
    key: "practices",
    label: "Engineering practices",
    weight: 1,
    terms: [
      "ci/cd",
      "observability",
      "monitoring",
      "compliance",
      "fips",
      "soc 2",
      "security",
      "postgresql",
      "postgres",
      "redis",
      "mentoring",
      "code review",
      "prometheus",
      "grafana",
      "dynamodb",
      "jenkins",
      "circle-ci",
      "github workflows",
      "claude code",
    ],
  },
];

/**
 * Skill names that must never become SKILL_GROUPS terms, with the reason. The
 * test suite asserts none of these leak in — the failure mode is silent (a
 * posting scores well on a word that means nothing here), so it needs a guard
 * rather than a comment.
 */
export const TERM_BLOCKLIST = [
  "abstract factory",
  "builder",
  "singleton",
  "template",
  "adapter",
  "iterator",
  "state",
  "observer",
  "solid principles",
  "agentic skills",
];

export const TARGET_TITLES = {
  ideal: [
    "principal engineer",
    "principal software engineer",
    "staff engineer",
    "senior staff engineer",
    "staff software engineer",
    "lead engineer",
    "tech lead",
    "software architect",
    "principal architect",
    "distinguished engineer",
    "member of technical staff",
  ],
  acceptable: [
    "senior software engineer",
    "senior engineer",
    "sde iii",
    "sde 3",
    "senior backend engineer",
    "senior platform engineer",
    "engineering lead",
  ],
  reject: [
    "intern",
    "internship",
    "junior",
    "graduate",
    "entry level",
    "fresher",
    "associate engineer",
    "trainee",
    "engineering manager",
    "director of engineering",
    "vp of engineering",
  ],
};

export const DOMAIN_TERMS = [
  "integration platform",
  "ipaas",
  "middleware",
  "erp",
  "data platform",
  "developer platform",
  "api platform",
  "saas",
  "b2b",
  "enterprise",
];

export const TARGET_MARKETS: Market[] = ["india", "us", "remote"];

export const PROFILE = {
  name: "Ankith D Rai",
  headline: "Principal Software Engineer",
  /**
   * Reference copy of the summary on the maintained .tex resume. The rendered
   * resume does not use this — summaryFor() in tailor.ts composes a per-posting
   * summary instead. Kept in sync so the two can be diffed by eye.
   */
  summary:
    "Principal Software Engineer with 7+ years architecting and scaling enterprise cloud integration platforms across US and EU regions. Owns a multi-tenant Apache Airflow platform serving 14+ enterprise customers, with deep expertise in Python, AWS (EKS, Aurora), Next.js/TypeScript, OAuth2, and SAP/Salesforce ERP ecosystems. Leads platform-wide initiatives spanning FIPS 140-2 compliance, observability, and AI-driven development, authoring a company-wide Claude Code methodology adopted across engineering teams.",
  contact: {
    email: "raiankith1@gmail.com",
    phone: "+91 9449549160",
    linkedin: "linkedin.com/in/ankithrai97",
    leetcode: "leetcode.com/ankith-rai",
    github: "github.com/ankith-rai",
    location: "Bengaluru, India",
  },
  careerStart: "2019-08",
  openToRelocation: true,
  needsSponsorshipForUS: true,
  roles: [
    {
      company: "Deltek",
      location: "Bengaluru, India",
      titles: [
        { title: "Principal Software Engineer", start: "Jan 2025", end: "Present" },
        { title: "Sr. Software Engineer", start: "Nov 2023", end: "Dec 2024" },
      ],
    },
    {
      company: "Replicon",
      location: "Bengaluru, India",
      titles: [
        { title: "Sr. Software Engineer", start: "Jan 2023", end: "Oct 2023" },
        { title: "Software Engineer", start: "Aug 2019", end: "Dec 2022" },
      ],
    },
  ] as RoleEntry[],
  skills: [
    {
      label: "Programming Languages",
      emphasis: ["languages"],
      items: ["Python", "Javascript (ES6)", "Typescript", "SQL", "Terraform", "YAML", "Salesforce Apex"],
    },
    {
      label: "Frameworks",
      emphasis: ["orchestration", "web", "integrations"],
      items: [
        "Apache Airflow",
        "Next.js",
        "Node.js",
        "React",
        "OAuth 2.0",
        "GraphQL",
        "SAP Cloud Integration",
        "SAP UI5/Fiori",
      ],
    },
    {
      label: "Libraries and APIs",
      emphasis: ["languages", "integrations"],
      items: [
        "Pandas",
        "Numpy",
        "Boto3",
        "SQLAlchemy",
        "Paramiko",
        "Atlassian Connect Express",
        "Salesforce-DX",
      ],
    },
    {
      label: "AWS Cloud",
      emphasis: ["cloud"],
      items: [
        "EKS",
        "Aurora Serverless PostgreSQL",
        "RDS",
        "EC2",
        "S3",
        "ECR",
        "Route 53",
        "CloudWatch",
        "WAF",
        "CodePipeline",
      ],
    },
    {
      label: "DevOps",
      emphasis: ["cloud", "practices"],
      items: [
        "Docker",
        "Kubernetes",
        "Helm",
        "AWS CodeBuild",
        "Jenkins",
        "GitHub Workflows",
        "Circle-CI",
        "Prometheus",
        "Grafana",
      ],
    },
    {
      label: "Database and Storage",
      emphasis: ["practices"],
      items: ["DynamoDB", "Redis", "Kafka", "SFTP"],
    },
    {
      label: "AI-Assisted Development",
      items: [
        "Claude Code",
        "Agentic Skills",
        "LLM-Driven Code Generation and Automated Code Review",
      ],
    },
    {
      label: "Design Patterns",
      items: [
        "Abstract Factory",
        "Builder",
        "Singleton",
        "Template",
        "Adapter",
        "Iterator",
        "State",
        "Observer",
        "SOLID Principles",
      ],
    },
  ] as SkillRow[],
  education: [
    {
      school: "NMAM Institute of Technology",
      credential: "Information Science and Engineering --- CGPA: 8.22",
      location: "Karnataka, IN",
      start: "June 2015",
      end: "July 2019",
    },
  ] as EducationEntry[],
  certifications: [
    {
      name: "DAG Authoring for Apache Airflow 3",
      issuer: "Astronomer",
      date: "Oct 2025",
      url: "https://www.credly.com/badges/7b47849c-988a-42f0-9525-5e235a65595b",
    },
    {
      name: "Docker Fundamentals",
      issuer: "Docker and LinkedIn",
      date: "May 2025",
      url: "https://www.linkedin.com/learning/certificates/0b0ea6f8ef3c25fb899f1b278ec5763b7ca6d2b02745492aecce0df7a2e6b770",
    },
    {
      name: "Apache Airflow Fundamentals",
      issuer: "Astronomer",
      date: "Oct 2024",
      url: "https://www.credly.com/badges/abb3eb34-207c-4b1e-af14-39ad3eb03d28",
    },
    {
      name: "Career Essentials in Generative AI",
      issuer: "Microsoft and LinkedIn",
      date: "Oct 2024",
      url: "https://www.linkedin.com/learning/certificates/654e22e124fcb0767d36cad9274ab4ddf9c7f34ab469deced37064d7c4e44838",
    },
  ] as Credential[],
  awards: [
    {
      name: "Spot Award",
      detail: "Onboarding of Enterprise customers in Airflow",
      years: "2023 | 2022",
    },
    {
      name: "Trailblazer and MVP Awards",
      detail: "Awarded twice for the best developers in R&D",
      years: "2021 | 2020",
    },
  ] as Award[],
};
