import { BULLETS, PROJECT_BULLETS } from "./bullets";
import { PROFILE, SKILL_GROUPS } from "./profile";
import type { Bullet } from "./profile";
import type { Job } from "./types";

export interface TailorPlan {
  headline: string;
  summary: string;
  emphasisGroups: string[];
  selected: Bullet[];
  keywordsToSurface: string[];
  gapsToAcknowledge: string[];
}

function jobText(job: Job): string {
  return `${job.title} ${job.description} ${job.tags.join(" ")}`.toLowerCase();
}

/** Which of the profile's skill groups this posting actually cares about. */
function emphasis(job: Job): string[] {
  const text = jobText(job);
  return SKILL_GROUPS.filter((g) => g.terms.some((t) => text.includes(t)))
    .sort((a, b) => b.weight - a.weight)
    .map((g) => g.key);
}

function titleFor(job: Job): string {
  const t = job.title.toLowerCase();
  if (t.includes("architect")) return "Principal Engineer / Architect";
  if (t.includes("staff")) return "Staff / Principal Software Engineer";
  if (t.includes("data") || t.includes("platform")) {
    return "Principal Engineer — Platform & Data";
  }
  return PROFILE.headline;
}

function summaryFor(job: Job, groups: string[]): string {
  const focus = groups
    .slice(0, 3)
    .map((k) => SKILL_GROUPS.find((g) => g.key === k)?.label.toLowerCase())
    .filter(Boolean)
    .join(", ");
  const years = new Date().getFullYear() - 2019;
  return (
    `${titleFor(job)} with ${years}+ years shipping enterprise integration and data ` +
    `platforms. Strongest in ${focus || "platform engineering"}. ` +
    `Looking to bring multi-region Airflow and AWS platform depth to ${job.company}.`
  );
}

/** Rank bullets by overlap with what the posting emphasises. */
function selectBullets(job: Job, groups: string[], limit = 9): Bullet[] {
  const weightOf = new Map(groups.map((g, i) => [g, groups.length - i]));
  const text = jobText(job);

  const scored = BULLETS.map((b) => {
    let s = b.tags.reduce((sum, tag) => sum + (weightOf.get(tag) ?? 0), 0);
    if (b.tags.includes("leadership")) s += 2;
    const firstWords = b.text.toLowerCase().split(" ").slice(0, 12).join(" ");
    if (text.includes("mentor") && firstWords.includes("mentored")) s += 3;
    return { bullet: b, s };
  }).sort((a, b) => b.s - a.s);

  // Keep at least two bullets from the earlier role so the resume reads as a career.
  const deltek = scored.filter((x) => x.bullet.role === "Deltek").slice(0, 7);
  const replicon = scored.filter((x) => x.bullet.role === "Replicon").slice(0, 3);
  return [...deltek, ...replicon].slice(0, limit).map((x) => x.bullet);
}

export function buildPlan(job: Job): TailorPlan {
  const groups = emphasis(job);
  return {
    headline: titleFor(job),
    summary: summaryFor(job, groups),
    emphasisGroups: groups,
    selected: selectBullets(job, groups),
    keywordsToSurface: job.score?.matchedKeywords.slice(0, 12) ?? [],
    gapsToAcknowledge: job.score?.missingKeywords.slice(0, 6) ?? [],
  };
}

// ── LaTeX escaping and rendering (Jake's Resume template) ───────────────────

export function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

const PREAMBLE = String.raw`%-------------------------
% Resume in Latex
% Based off of: Jake Gutierrez's template (Jake's Resume)
% License : MIT
%------------------------
\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\pdfgentounicode=1

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
`;

export function renderLatex(job: Job, plan: TailorPlan): string {
  const c = PROFILE.contact;
  const e = escapeLatex;

  const header = String.raw`
\begin{center}
    \textbf{\Huge \scshape ${e(PROFILE.name)}} \\ \vspace{1pt}
    \small ${e(c.phone)} $|$ \href{mailto:${c.email}}{\underline{${e(c.email)}}} $|$
    \href{https://${c.linkedin}}{\underline{${e(c.linkedin)}}} $|$
    \href{https://${c.github}}{\underline{${e(c.github)}}} $|$ ${e(c.location)}
\end{center}

\section{Summary}
 \small{${e(plan.summary)}}
 \vspace{-8pt}
`;

  const byRole = (company: string) =>
    plan.selected.filter((b) => b.role === company);

  const experience = [
    String.raw`\section{Experience}`,
    String.raw`  \resumeSubHeadingListStart`,
    ...PROFILE.roles.map((r) => {
      const items = byRole(r.company);
      if (items.length === 0) return "";
      return [
        String.raw`    \resumeSubheading{${e(r.title)}}{${e(r.start)} -- ${e(r.end)}}{${e(r.company)}}{${e(r.location)}}`,
        String.raw`      \resumeItemListStart`,
        ...items.map((b) => String.raw`        \resumeItem{${e(b.text)}}`),
        String.raw`      \resumeItemListEnd`,
      ].join("\n");
    }),
    String.raw`  \resumeSubHeadingListEnd`,
  ]
    .filter(Boolean)
    .join("\n");

  const ordered = plan.emphasisGroups;
  const skillLine = (label: string, items: string[]) =>
    String.raw`     \textbf{${e(label)}}{: ${e(items.join(", "))}} \\`;

  const skillRows: string[] = [];
  const s = PROFILE.skills;
  const pushIf = (key: string, label: string, items: string[]) => {
    if (ordered.includes(key)) skillRows.push(skillLine(label, items));
  };
  skillRows.push(skillLine("Languages", s.languages));
  pushIf("orchestration", "Data & Orchestration", s.data);
  pushIf("cloud", "Cloud & Infrastructure", s.cloud);
  pushIf("integrations", "Integrations", s.integrations);
  pushIf("web", "Web", s.web);
  // Anything not emphasised still appears, just later.
  if (!ordered.includes("orchestration")) skillRows.push(skillLine("Data & Orchestration", s.data));
  if (!ordered.includes("cloud")) skillRows.push(skillLine("Cloud & Infrastructure", s.cloud));
  if (!ordered.includes("integrations")) skillRows.push(skillLine("Integrations", s.integrations));

  const skills = [
    String.raw`\section{Technical Skills}`,
    String.raw` \begin{itemize}[leftmargin=0.15in, label={}]`,
    String.raw`    \small{\item{`,
    ...skillRows,
    String.raw`    }}`,
    String.raw` \end{itemize}`,
    String.raw` \vspace{-16pt}`,
  ].join("\n");

  const projects = [
    String.raw`\section{Projects}`,
    String.raw`    \resumeSubHeadingListStart`,
    ...PROJECT_BULLETS.map((p) =>
      [
        String.raw`      \resumeProjectHeading{\textbf{${e(p.role)}} $|$ \emph{TypeScript, Next.js}}{}`,
        String.raw`          \resumeItemListStart`,
        String.raw`            \resumeItem{${e(p.text)}}`,
        String.raw`          \resumeItemListEnd`,
      ].join("\n"),
    ),
    String.raw`    \resumeSubHeadingListEnd`,
  ].join("\n");

  const note = String.raw`
% Tailored for: ${e(job.title)} at ${e(job.company)}
% Match score: ${job.score?.total ?? "n/a"}/100
% Keywords surfaced: ${e(plan.keywordsToSurface.join(", ") || "none")}
% Gaps to prepare for: ${e(plan.gapsToAcknowledge.join(", ") || "none")}
`;

  return [
    PREAMBLE,
    note,
    String.raw`\begin{document}`,
    header,
    experience,
    skills,
    projects,
    String.raw`\end{document}`,
  ].join("\n");
}

export function tailorFor(job: Job): { plan: TailorPlan; latex: string } {
  const plan = buildPlan(job);
  return { plan, latex: renderLatex(job, plan) };
}
