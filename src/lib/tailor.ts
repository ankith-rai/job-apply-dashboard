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

/**
 * Years of experience, derived from PROFILE.careerStart rather than a literal.
 * This used to hardcode 2019, which meant careerStart was declared and never
 * read — two sources of truth for the same fact, free to drift apart.
 */
function yearsOfExperience(now = new Date()): number {
  const [y, m] = PROFILE.careerStart.split("-").map(Number);
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return Math.floor(months / 12);
}

function summaryFor(job: Job, groups: string[]): string {
  const focus = groups
    .slice(0, 3)
    .map((k) => SKILL_GROUPS.find((g) => g.key === k)?.label.toLowerCase())
    .filter(Boolean)
    .join(", ");
  const years = yearsOfExperience();
  return (
    `${titleFor(job)} with ${years}+ years architecting and scaling enterprise cloud ` +
    `integration platforms across US and EU regions. Owns a multi-tenant Apache Airflow ` +
    `platform serving 14+ enterprise customers; strongest in ${focus || "platform engineering"}. ` +
    `Looking to bring multi-region Airflow and AWS platform depth to ${job.company}.`
  );
}

/**
 * Rank bullets by overlap with what the posting emphasises. The limit is the
 * size of the verified bank (7 Deltek + 3 Replicon), so nothing real is cut;
 * lower it only if a posting needs a shorter resume.
 */
function selectBullets(job: Job, groups: string[], limit = 10): Bullet[] {
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
% Author : Jake Gutierrez
% Based off of: https://github.com/sb2nov/resume
% License : MIT
%------------------------
\documentclass[letterpaper,10.5pt]{extarticle}
\setlength{\footskip}{4.08003pt}

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
\addtolength{\topmargin}{-0.78in}
\addtolength{\textheight}{1.7in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-6pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-6pt}]

\pdfgentounicode=1

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeWorkExpHeading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.98\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & \textnormal{\small#2} \\
      \textit{\small#3} & \textnormal{\small #4} \\
    \end{tabular*}\vspace{-6pt}
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

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[itemsep=2pt, parsep=0pt, topsep=2pt]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-4pt}}
`;

export function renderLatex(job: Job, plan: TailorPlan): string {
  const c = PROFILE.contact;
  const e = escapeLatex;

  const header = String.raw`
\begin{center}
    \textbf{\Huge \scshape ${e(PROFILE.name)}} \\ \vspace{6pt}
    \small ${e(c.phone)} $|$ \href{mailto:${c.email}}{\underline{${e(c.email)}}} $|$
    \href{https://www.${c.linkedin}}{\underline{${e(c.linkedin)}}} $|$
    \href{https://${c.leetcode}}{\underline{${e(c.leetcode)}}} $|$
    \href{https://${c.github}}{\underline{${e(c.github)}}}
\end{center}

\section{Professional Summary}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
     {${e(plan.summary)}}
    \vspace{-6pt}
    }}
 \end{itemize}
`;

  const byCompany = (company: string) =>
    plan.selected.filter((b) => b.role === company);

  // One heading per COMPANY, with every title held there stacked inside it.
  // Iterating PROFILE.roles when it held one entry per *title* emitted the
  // company's whole bullet list once per title — all seven Deltek bullets
  // printed twice on every resume this generated.
  const experience = [
    String.raw`\section{Work Experience}`,
    String.raw`  \resumeSubHeadingListStart`,
    ...PROFILE.roles.map((r) => {
      const items = byCompany(r.company);
      if (items.length === 0) return "";
      const [current, ...earlier] = r.titles;
      const stint = (t: { title: string; start: string; end: string }) =>
        `${t.title} (${t.start} - ${t.end})`;
      return [
        String.raw`    \resumeWorkExpHeading`,
        String.raw`      {${e(r.company)}}`,
        String.raw`      {${e(stint(current))}}`,
        String.raw`      {${e(r.location)}}`,
        String.raw`      {${e(earlier.map(stint).join(" $|$ "))}}`,
        String.raw`      \\`,
        String.raw`      \resumeItemListStart`,
        ...items.map((b) => String.raw`        \resumeItem{${e(b.text)}}`),
        String.raw`      \resumeItemListEnd`,
      ].join("\n");
    }),
    String.raw`  \resumeSubHeadingListEnd`,
  ]
    .filter(Boolean)
    .join("\n");

  // Rows whose emphasis keys the posting stresses float up; the rest keep the
  // order they are declared in. Every row still prints — tailoring reorders
  // skills, it does not hide them.
  const ordered = plan.emphasisGroups;
  const rank = (row: { emphasis?: string[] }) => {
    const hits = (row.emphasis ?? []).map((k) => ordered.indexOf(k)).filter((i) => i >= 0);
    return hits.length ? Math.min(...hits) : Number.MAX_SAFE_INTEGER;
  };
  const skillRows = PROFILE.skills
    .map((row, i) => ({ row, i }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.i - b.i)
    .map(
      ({ row }) =>
        String.raw`     \textbf{${e(row.label)}}{: ${e(row.items.join(", "))}} \\`,
    );

  const skills = [
    String.raw`\section{Skills Summary}`,
    String.raw` \begin{itemize}[leftmargin=0.15in, label={}]`,
    String.raw`    \small{\item{`,
    ...skillRows,
    String.raw`    }}`,
    String.raw` \end{itemize}`,
    String.raw` \vspace{-6pt}`,
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

  const education = [
    String.raw`\section{Education}`,
    String.raw`  \resumeSubHeadingListStart`,
    ...PROFILE.education.map((ed) =>
      String.raw`    \resumeSubheading{${e(ed.school)}}{${e(ed.start)} -- ${e(ed.end)}}{${ed.credential}}{${e(ed.location)}}`,
    ),
    String.raw`  \resumeSubHeadingListEnd`,
  ].join("\n");

  const certifications = [
    String.raw`\section{Certifications}`,
    String.raw`    \resumeSubHeadingListStart`,
    ...PROFILE.certifications.map((cert) => {
      const name = cert.url
        ? String.raw`\href{${cert.url}}{${e(cert.name)}}`
        : e(cert.name);
      return String.raw`        \resumeProjectHeading{\textbf{${name}} $|$ \emph{${e(cert.issuer)}}}{${e(cert.date)}}`;
    }),
    String.raw`    \resumeSubHeadingListEnd`,
  ].join("\n");

  const awards = [
    String.raw`\section{Awards}`,
    String.raw`    \resumeSubHeadingListStart`,
    ...PROFILE.awards.map((a) =>
      String.raw`        \resumeProjectHeading{\textbf{${e(a.name)}} $|$ \emph{${e(a.detail)}}}{${e(a.years)}}`,
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
    String.raw`\fontsize{11pt}{14.5pt}\selectfont`,
    header,
    skills,
    experience,
    education,
    certifications,
    awards,
    projects,
    String.raw`\end{document}`,
  ].join("\n");
}

export function tailorFor(job: Job): { plan: TailorPlan; latex: string } {
  const plan = buildPlan(job);
  return { plan, latex: renderLatex(job, plan) };
}
