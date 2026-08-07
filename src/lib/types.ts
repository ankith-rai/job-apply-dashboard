export type Market = "india" | "us" | "remote";

export type Stage =
  | "matched"
  | "queued"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "skipped";

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "matched", label: "Needs review", hint: "Scored and waiting on you" },
  { key: "queued", label: "Approved", hint: "You cleared it to send" },
  { key: "applied", label: "Applied", hint: "Submitted" },
  { key: "interview", label: "Interviewing", hint: "They replied" },
  { key: "offer", label: "Offer", hint: "Decision time" },
  { key: "rejected", label: "Closed", hint: "No further action" },
  { key: "skipped", label: "Passed", hint: "You chose not to apply" },
];

export interface ScoreFactor {
  key: string;
  label: string;
  earned: number;
  max: number;
  detail?: string;
}

export interface MatchScore {
  total: number;
  factors: ScoreFactor[];
  matchedKeywords: string[];
  missingKeywords: string[];
  flags: string[];
  scoredAt: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  market: Market[];
  remote: boolean;
  url: string;
  source: string;
  postedAt: string;
  fetchedAt: string;
  description: string;
  tags: string[];
  salary?: string;
  score?: MatchScore;
  stage: Stage;
  stageUpdatedAt: string;
  notes?: string;
  tailoredResume?: string;
}

export interface RunStageResult {
  key: string;
  label: string;
  status: "ok" | "warn" | "fail";
  count: number;
  detail: string;
  ms: number;
}

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  stages: RunStageResult[];
  fetched: number;
  added: number;
  duplicates: number;
  scored: number;
  tailored: number;
  offline: boolean;
}

export interface Store {
  jobs: Job[];
  runs: RunRecord[];
}
