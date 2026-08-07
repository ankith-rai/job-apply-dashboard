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

export interface RoleEntry {
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
}

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
    ],
  },
  {
    key: "languages",
    label: "Languages",
    weight: 3,
    terms: ["python", "typescript", "javascript", "sql", "go", "java"],
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
    ],
  },
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
  summary:
    "Principal engineer with 6+ years building cloud integration platforms — Apache Airflow at multi-region scale, AWS, Python, and enterprise ERP connectors.",
  contact: {
    email: "YOUR_EMAIL@example.com",
    phone: "YOUR_PHONE",
    linkedin: "linkedin.com/in/YOUR_HANDLE",
    github: "github.com/YOUR_HANDLE",
    location: "Bengaluru, India",
  },
  careerStart: "2019-08",
  openToRelocation: true,
  needsSponsorshipForUS: true,
  roles: [
    {
      company: "Deltek",
      title: "Principal Software Engineer",
      location: "Bengaluru, India",
      start: "Jan 2025",
      end: "Present",
    },
    {
      company: "Deltek",
      title: "Senior Software Engineer",
      location: "Bengaluru, India",
      start: "Oct 2023",
      end: "Jan 2025",
    },
    {
      company: "Replicon",
      title: "Software Engineer",
      location: "Bengaluru, India",
      start: "Aug 2019",
      end: "Oct 2023",
    },
  ] as RoleEntry[],
  skills: {
    languages: ["Python", "TypeScript", "JavaScript", "SQL"],
    cloud: ["AWS (EKS, Aurora, S3, Lambda)", "Docker", "Kubernetes", "Boto3"],
    data: ["Apache Airflow", "ETL/ELT", "PostgreSQL"],
    integrations: [
      "SAP Cloud Integration",
      "SAP SuccessFactors",
      "Salesforce",
      "QuickBooks",
      "OAuth2 / SAML",
    ],
    web: ["Next.js", "React", "Node.js"],
  },
};
