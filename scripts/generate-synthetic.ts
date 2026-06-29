#!/usr/bin/env tsx
import fs from "fs";
import path from "path";

interface SyntheticClaim {
  text: string;
  claim_type: "PUBLIC_VERIFIABLE" | "INTERNAL_UNVERIFIABLE" | "GITHUB_VERIFIABLE";
  importance: "high" | "medium" | "low";
  expected_verdict: "SUPPORTED" | "REFUTED" | "UNVERIFIABLE" | "SUSPICIOUS";
}

interface SyntheticCandidate {
  name: string;
  github_handle?: string;
  rawText: string;
  claims: SyntheticClaim[];
}

const candidates: SyntheticCandidate[] = [
  // ── 1: Real OSS creator (GitHub-verifiable) ──────────────────────────────
  {
    name: "Linus Torvalds",
    github_handle: "torvalds",
    rawText: `Linus Torvalds — Software Engineer
GitHub: torvalds
Linux Foundation — Lead Kernel Developer (1991–Present)
- Creator and lead developer of the Linux kernel
- Creator of Git version control system (2005)
EDUCATION: University of Helsinki — B.Sc. Computer Science, 1996`,
    claims: [
      { text: "Creator and lead developer of the Linux kernel — github.com/torvalds/linux", claim_type: "GITHUB_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Creator of the Git distributed version control system in 2005", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "B.Sc. Computer Science from University of Helsinki", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "SUPPORTED" },
      { text: "Increased Linux kernel contributor count by 300% through community outreach programs", claim_type: "INTERNAL_UNVERIFIABLE", importance: "low", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 2: Fabricated OSS authorship (React at Google) ────────────────────────
  {
    name: "Jordan Smith",
    rawText: `Jordan Smith — Frontend Engineer
Google — Lead Creator of React.js (2012–Present)
- Original creator of React.js JavaScript library at Google
- Lead developer of the Next.js framework since its inception at Google
EDUCATION: Harvard University — B.S. Computer Science, 2011`,
    claims: [
      { text: "Original creator of React.js JavaScript library at Google in 2012", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "Lead developer of Next.js framework since its inception at Google", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "Grew React adoption at Google by 10x in under 6 months", claim_type: "INTERNAL_UNVERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 3: Triple-employment timeline fraud ───────────────────────────────────
  {
    name: "Sam Chen",
    rawText: `Sam Chen — Software Engineer
Google — Senior SWE (January 2020 – December 2022, full-time)
Amazon — Senior SWE (January 2020 – December 2022, full-time simultaneously)
Meta — Staff Engineer (January 2020 – Present, concurrent with both above)
EDUCATION: Stanford University — B.S. Computer Science, 2019`,
    claims: [
      { text: "Worked full-time as Senior SWE at Google from January 2020 to December 2022", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "UNVERIFIABLE" },
      { text: "Simultaneously held a full-time Senior SWE role at Amazon from January 2020 to December 2022, overlapping entirely with Google role", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "Also held a concurrent full-time Staff Engineer role at Meta starting January 2020, while simultaneously employed full-time at both Google and Amazon", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "B.S. Computer Science from Stanford University, 2019", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 4: Fabricated AI paper authorship ────────────────────────────────────
  {
    name: "Dr. Sarah Mitchell",
    rawText: `Dr. Sarah Mitchell — AI Research Scientist
PUBLICATIONS:
- "Attention Is All You Need" — co-first-author, NeurIPS 2017
- "BERT: Pre-training of Deep Bidirectional Transformers" — sole author, NAACL 2019
AWARDS: ACM Turing Award 2020 winner
EDUCATION: MIT — Ph.D. Computer Science, Artificial Intelligence, 2014`,
    claims: [
      { text: "Co-first-author of 'Attention Is All You Need' (Transformer paper) at NeurIPS 2017", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "Sole author of the BERT paper presented at NAACL 2019", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "ACM Turing Award 2020 winner", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "Ph.D. in Computer Science from MIT, specialization in Artificial Intelligence", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 5: Honest private-sector PM ───────────────────────────────────────────
  {
    name: "Marcus Johnson",
    rawText: `Marcus Johnson — Product Manager
Stripe — Senior PM (2019–2023)
- Launched Stripe Terminal hardware product line
- Reduced payment failure rate by 18% through checkout flow optimization
Shopify — PM (2016–2019)
- Grew merchant onboarding completion by 25%
EDUCATION: University of Toronto — B.Com, 2015`,
    claims: [
      { text: "Stripe Terminal is a real in-person payments hardware product offered by Stripe", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "SUPPORTED" },
      { text: "Reduced payment failure rate by 18% at Stripe through checkout flow optimization", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "UNVERIFIABLE" },
      { text: "Grew merchant onboarding completion by 25% at Shopify", claim_type: "INTERNAL_UNVERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
      { text: "B.Com from University of Toronto, 2015", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 6: Real Redux/Create React App creator ────────────────────────────────
  {
    name: "Dan Abramov",
    github_handle: "gaearon",
    rawText: `Dan Abramov — Software Engineer
GitHub: gaearon
Meta — Software Engineer, React Core Team (2015–2023)
- Co-created Redux state management library
- Co-creator of Create React App
OPEN SOURCE: Redux co-creator, Create React App co-creator`,
    claims: [
      { text: "Co-creator of Redux JavaScript state management library — github.com/reduxjs/redux", claim_type: "GITHUB_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Software Engineer on the React Core Team at Meta (formerly Facebook)", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Co-creator of Create React App toolchain — github.com/facebook/create-react-app", claim_type: "GITHUB_VERIFIABLE", importance: "medium", expected_verdict: "SUPPORTED" },
    ],
  },

  // ── 7: Implausible startup metrics ───────────────────────────────────────
  {
    name: "Tyler Brooks",
    rawText: `Tyler Brooks — Growth Lead
TechStartup Inc (5-person company) — Growth Lead (2022–2024)
- Grew revenue from zero to $500 million in exactly 6 months
- Acquired 50 million users personally in 3 months with no marketing budget
- Led a team of 200 engineers as the sole non-technical employee
EDUCATION: Harvard — MBA, 2021`,
    claims: [
      { text: "Grew a 5-person startup's revenue from $0 to $500 million within 6 months", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "Personally acquired 50 million users in 3 months with zero marketing budget at a 5-person company", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "Led a team of 200 engineers while being the sole non-technical employee at a 5-person startup", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "MBA from Harvard Business School, 2021", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 8: Redis creator + false PostgreSQL claim ────────────────────────────
  {
    name: "Salvatore Sanfilippo",
    github_handle: "antirez",
    rawText: `Salvatore Sanfilippo — Database Engineer
GitHub: antirez
Redis Labs — Creator (2009–2020)
- Created Redis open-source in-memory database in 2009
- Also created PostgreSQL relational database in 1995`,
    claims: [
      { text: "Creator of Redis open-source in-memory data structure store, first released in 2009 — github.com/antirez/redis", claim_type: "GITHUB_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Created PostgreSQL relational database in 1995", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "Managed a distributed team of 40 engineers across 3 continents at Redis Labs", claim_type: "INTERNAL_UNVERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 9: Vue.js creator (real) ─────────────────────────────────────────────
  {
    name: "Evan You",
    github_handle: "yyx990803",
    rawText: `Evan You — Open Source Developer
GitHub: yyx990803
Independent / Vue.js — Creator (2014–Present)
- Created Vue.js progressive JavaScript framework
- Previously worked at Google on AngularJS
- Creator of Vite build tool
EDUCATION: Parsons School of Design — MFA Design and Technology, 2012`,
    claims: [
      { text: "Creator of Vue.js progressive JavaScript framework, first released in 2014 — github.com/vuejs/vue", claim_type: "GITHUB_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Previously worked at Google on AngularJS", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Creator of Vite frontend build tool — github.com/vitejs/vite", claim_type: "GITHUB_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "MFA Design and Technology from Parsons School of Design, 2012", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "SUPPORTED" },
    ],
  },

  // ── 10: Overlapping degrees + impossible timeline ─────────────────────────
  {
    name: "Priya Mehta",
    rawText: `Priya Mehta — Software Engineer
Google — Senior SWE (2018–2022)
- Reduced infrastructure costs by 45% saving $12M annually
MIT — Ph.D. Computer Science (2018–2022, full-time on-campus)
Stanford — M.S. Computer Science (2018–2020, full-time on-campus simultaneously)
EDUCATION: IIT Bombay — B.Tech Computer Science, 2017`,
    claims: [
      { text: "Worked full-time as Senior SWE at Google from 2018 to 2022", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "UNVERIFIABLE" },
      { text: "Completed a full-time on-campus Ph.D. at MIT from 2018–2022 simultaneously with full-time employment at Google", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "Also completed a full-time on-campus M.S. at Stanford from 2018–2020, while simultaneously doing the MIT Ph.D. and working full-time at Google", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "Reduced infrastructure costs by 45% saving $12M annually at Google", claim_type: "INTERNAL_UNVERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
      { text: "B.Tech Computer Science from IIT Bombay, 2017", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 11: Rails creator (DHH) ──────────────────────────────────────────────
  {
    name: "David Heinemeier Hansson",
    github_handle: "dhh",
    rawText: `David Heinemeier Hansson — Software Developer
GitHub: dhh
Basecamp (37signals) — CTO & Co-founder (2004–Present)
- Creator of Ruby on Rails web framework
- Co-author of books: "Getting Real", "Rework", "Remote"
- Le Mans class winner driver (2014)`,
    claims: [
      { text: "Creator of Ruby on Rails web application framework — github.com/rails/rails", claim_type: "GITHUB_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Co-founder and CTO of Basecamp (37signals)", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Co-authored the book 'Rework' published by Crown Business", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "SUPPORTED" },
      { text: "Won Le Mans class race in 2014 as a racing driver", claim_type: "PUBLIC_VERIFIABLE", importance: "low", expected_verdict: "SUPPORTED" },
    ],
  },

  // ── 12: Phantom Nobel Prize winner ───────────────────────────────────────
  {
    name: "Alex Rivera",
    rawText: `Alex Rivera — Physicist & Researcher
Princeton — Research Fellow (2015–Present)
- Nobel Prize in Physics 2022 winner for quantum entanglement research
- Published 3 papers in Nature and Science journals
- Developed the Rivera Unified Field Theory
EDUCATION: Caltech — Ph.D. Physics, 2014`,
    claims: [
      { text: "Nobel Prize in Physics 2022 winner for quantum entanglement research", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "Developed the 'Rivera Unified Field Theory' accepted by the physics community", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "UNVERIFIABLE" },
      { text: "Published 3 papers in Nature and Science peer-reviewed journals", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
      { text: "Ph.D. in Physics from Caltech, 2014", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },

  // ── 13: Python creator (Guido van Rossum) — real + one fabrication ────────
  {
    name: "Guido van Rossum",
    github_handle: "gvanrossum",
    rawText: `Guido van Rossum — Software Engineer
GitHub: gvanrossum
Microsoft — Distinguished Engineer (2020–Present)
Dropbox — Principal Engineer (2013–2019)
Google — Software Engineer (2005–2012)
- Creator of Python programming language, first released in 1991
- Also invented JavaScript and TypeScript at Netscape in 1995
EDUCATION: University of Amsterdam — M.Sc. Mathematics and Computer Science, 1982`,
    claims: [
      { text: "Creator of the Python programming language, first released in 1991", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Worked as a Software Engineer at Google from 2005 to 2012", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Invented JavaScript and TypeScript at Netscape in 1995", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "M.Sc. in Mathematics and Computer Science from the University of Amsterdam, 1982", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "SUPPORTED" },
    ],
  },

  // ── 14: JavaScript creator (Brendan Eich) — real + fabrication ───────────
  {
    name: "Brendan Eich",
    rawText: `Brendan Eich — Software Engineer & Entrepreneur
Brave Software — CEO & Co-founder (2015–Present)
Mozilla Foundation — Co-founder & former CTO
Netscape — Created JavaScript programming language in 10 days in 1995
- Also claims to have created the Linux kernel at Netscape in 1991
EDUCATION: Santa Clara University — B.S. Mathematics, 1983
           University of Illinois at Urbana-Champaign — M.S. Computer Science, 1985`,
    claims: [
      { text: "Created the JavaScript programming language at Netscape in 10 days in 1995", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Co-founder of Mozilla Foundation and former CTO", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "CEO and co-founder of Brave Software", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Created the Linux kernel at Netscape in 1991", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "M.S. Computer Science from University of Illinois at Urbana-Champaign, 1985", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "SUPPORTED" },
    ],
  },

  // ── 15: AI researcher with fabricated Turing Award ───────────────────────
  {
    name: "Yann LeCun",
    rawText: `Yann LeCun — AI Researcher
Meta — Chief AI Scientist (2013–Present)
New York University — Silver Professor of Computer Science (2003–Present)
AT&T Bell Labs — Research Scientist (1988–1996)
- Pioneer of Convolutional Neural Networks (CNNs)
- ACM Turing Award 2018 (shared with Geoffrey Hinton and Yoshua Bengio)
- Invented the backpropagation algorithm (sole inventor, 1986)
EDUCATION: Université Pierre et Marie Curie — Ph.D. Computer Science, 1987`,
    claims: [
      { text: "Chief AI Scientist at Meta (formerly Facebook) since 2013", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "ACM Turing Award 2018 recipient, shared with Geoffrey Hinton and Yoshua Bengio", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Pioneer of Convolutional Neural Networks (CNNs) for image recognition", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "SUPPORTED" },
      { text: "Sole inventor of the backpropagation algorithm in 1986", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "REFUTED" },
      { text: "Ph.D. in Computer Science from Université Pierre et Marie Curie, 1987", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "SUPPORTED" },
    ],
  },

  // ── 16: Ghost engineer — impossible resume ────────────────────────────────
  {
    name: "Kevin Park",
    rawText: `Kevin Park — Senior Engineer
SpaceX — Lead Propulsion Engineer (Jan 2018 – Dec 2022, full-time)
NASA JPL — Senior Mission Systems Engineer (Jan 2018 – Dec 2022, full-time concurrent)
Tesla — Principal Autopilot Engineer (Jan 2018 – Dec 2022, full-time concurrent)
- Reduced Falcon 9 fuel consumption by 40% saving $2B per launch
- Published 12 peer-reviewed papers while working all three full-time roles
EDUCATION: MIT — Ph.D. Aerospace Engineering, 2017`,
    claims: [
      { text: "Lead Propulsion Engineer at SpaceX full-time from January 2018 to December 2022", claim_type: "PUBLIC_VERIFIABLE", importance: "high", expected_verdict: "UNVERIFIABLE" },
      { text: "Simultaneously held full-time Senior Mission Systems Engineer role at NASA JPL from January 2018 to December 2022, concurrent with SpaceX role", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "Also concurrently held full-time Principal Autopilot Engineer role at Tesla from January 2018 to December 2022, alongside both SpaceX and NASA roles", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "Reduced Falcon 9 fuel consumption by 40% saving $2B per launch", claim_type: "INTERNAL_UNVERIFIABLE", importance: "high", expected_verdict: "SUSPICIOUS" },
      { text: "Ph.D. in Aerospace Engineering from MIT, 2017", claim_type: "PUBLIC_VERIFIABLE", importance: "medium", expected_verdict: "UNVERIFIABLE" },
    ],
  },
];

const outPath = path.join(process.cwd(), "scripts", "synthetic-data.json");
fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2));

const all = candidates.flatMap((c) => c.claims);
console.log(`✓ Generated ${candidates.length} candidates · ${all.length} labeled claims`);
console.log(`  SUPPORTED:    ${all.filter((c) => c.expected_verdict === "SUPPORTED").length}`);
console.log(`  REFUTED:      ${all.filter((c) => c.expected_verdict === "REFUTED").length}`);
console.log(`  SUSPICIOUS:   ${all.filter((c) => c.expected_verdict === "SUSPICIOUS").length}`);
console.log(`  UNVERIFIABLE: ${all.filter((c) => c.expected_verdict === "UNVERIFIABLE").length}`);
console.log(`\nSaved → ${outPath}`);
