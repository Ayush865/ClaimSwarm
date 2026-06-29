#!/usr/bin/env tsx
/**
 * Generates 12 professional resume PDFs across 3 Overleaf-style templates.
 *   - 4 real mid-profile people (accurate public info, no fabrications)
 *   - 8 fabricated personas with planted claims (mixed SUPPORTED / REFUTED / SUSPICIOUS / UNVERIFIABLE)
 *
 * Run: npx tsx scripts/generate-resume-pdfs.ts
 * Output: scripts/resumes/*.pdf  +  scripts/resumes/ground-truth.json
 */

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

type Template = "classic" | "modern" | "compact";
type ExpectedVerdict = "SUPPORTED" | "REFUTED" | "SUSPICIOUS" | "UNVERIFIABLE";

interface PlantedClaim {
  text: string;
  expected_verdict: ExpectedVerdict;
}

interface ResumeEntry {
  title: string;           // role title
  org: string;             // company / institution
  dates: string;
  bullets: string[];
}

interface Resume {
  name: string;
  title: string;
  email: string;
  location: string;
  links: string[];         // github, linkedin, website
  summary?: string;
  experience: ResumeEntry[];
  education: ResumeEntry[];
  skills?: string[];
  awards?: string[];
  publications?: string[];
  template: Template;
  isReal: boolean;         // true = accurate public info, no fabrications
  plantedClaims?: PlantedClaim[];
}

// ─── Real Resumes (accurate public info) ─────────────────────────────────────

const realResumes: Resume[] = [
  {
    name: "Sindre Sorhus",
    title: "Full-Time Open-Sourcerer & App Developer",
    email: "sindresorhus@gmail.com",
    location: "Thailand (originally Norway)",
    links: ["github.com/sindresorhus", "sindresorhus.com"],
    summary:
      "Independent open-source developer maintaining 1,100+ npm packages with over 2 billion monthly downloads. Creator of the Awesome lists ecosystem and dozens of widely-adopted Node.js utilities.",
    experience: [
      {
        title: "Full-Time Open-Source Developer & App Maker",
        org: "Independent",
        dates: "2014 – Present",
        bullets: [
          "Maintains 1,100+ npm packages; Webpack depends on 101+ and Babel on 144+ of his packages",
          "Creator of the Awesome GitHub list (200k+ stars, 6th most starred repo on GitHub)",
          "Creator of Chalk, Ora, Got, AVA test runner, and hundreds of widely-adopted utilities",
          "2 billion npm package downloads per month across maintained packages",
          "79,000+ GitHub followers; recognised as influential contributor in the TypeScript community",
        ],
      },
    ],
    education: [],
    skills: ["TypeScript", "Node.js", "npm ecosystem", "Swift", "macOS app development"],
    awards: [],
    template: "modern",
    isReal: true,
  },

  {
    name: "Kent C. Dodds",
    title: "Software Engineer, Educator & Open-Source Author",
    email: "kent@kentcdodds.com",
    location: "Salt Lake City, Utah, USA",
    links: ["github.com/kentcdodds", "kentcdodds.com", "epicweb.dev"],
    summary:
      "Creator of Testing Library — the standard testing approach for React applications with 33 million weekly downloads. Google Developer Expert, Microsoft MVP, and TC-39 committee member.",
    experience: [
      {
        title: "Founder & Educator",
        org: "Kent C. Dodds Tech LLC / EpicWeb.dev",
        dates: "2019 – Present",
        bullets: [
          "Produces epicweb.dev and epicreact.dev — comprehensive full-stack and React courses",
          "100+ conference talks on JavaScript, React, testing patterns, and engineering career",
          "Created Epic Stack: opinionated full-stack web app template used by thousands of developers",
        ],
      },
      {
        title: "Director of Developer Experience",
        org: "Remix (now part of Shopify)",
        dates: "2021 – 2022",
        bullets: [
          "Joined as Director of Developer Experience at Remix, founded by Ryan Florence and Michael Jackson",
          "Led developer experience, documentation, and community growth for the Remix framework",
        ],
      },
      {
        title: "Senior / Staff Software Engineer",
        org: "PayPal",
        dates: "2015 – 2019",
        bullets: [
          "Web infrastructure engineer working on internal tooling and frontend architecture",
          "Created Testing Library while at PayPal; now the most-downloaded React testing library",
        ],
      },
      {
        title: "Frontend Engineer",
        org: "Domo",
        dates: "2012 – 2014",
        bullets: ["Frontend engineer on BI and data visualisation platform"],
      },
    ],
    education: [
      {
        title: "M.S. Information Systems",
        org: "Brigham Young University (BYU)",
        dates: "2014",
        bullets: ["Owen Cherrington Scholarship recipient"],
      },
    ],
    skills: ["React", "Testing Library", "JavaScript", "TypeScript", "Node.js", "Remix", "Full-Stack"],
    awards: [
      "Google Developer Expert (GDE) — Web Technologies",
      "Microsoft Most Valuable Professional (MVP)",
      "GitHub Star",
      "TC-39 JavaScript Standards Committee Member",
      "GitNation Open Source Awards — Most Impactful Contribution (Testing Library)",
    ],
    template: "classic",
    isReal: true,
  },

  {
    name: "Matteo Collina",
    title: "Co-Founder & CTO · Node.js TSC Chair",
    email: "hello@matteocollina.com",
    location: "Forlì, Italy",
    links: ["github.com/mcollina", "nodeland.dev"],
    summary:
      "Co-founder and CTO of Platformatic. Co-creator of Fastify web framework and Pino JSON logger. Node.js Technical Steering Committee Chair. 60+ international conference talks. 17 billion+ annual npm downloads for maintained packages.",
    experience: [
      {
        title: "Co-Founder & CTO",
        org: "Platformatic",
        dates: "2022 – Present",
        bullets: [
          "Building open-source and commercial developer infrastructure for Node.js applications",
          "Chairs the Node.js Technical Steering Committee (TSC)",
          "Board member of the OpenJS Foundation",
        ],
      },
      {
        title: "Chief Software Architect",
        org: "NearForm",
        dates: "2016 – 2022",
        bullets: [
          "Co-created Fastify web framework for Node.js (36,000+ GitHub stars)",
          "Created Pino JSON logger — 5× faster than Winston and Bunyan",
          "Created Mercurius GraphQL adapter and fast-json-stringify serialiser",
        ],
      },
    ],
    education: [
      {
        title: "Ph.D. Computer Science",
        org: "University of Bologna",
        dates: "2014",
        bullets: ['Thesis: "Application Platforms for the Internet of Things"'],
      },
    ],
    skills: ["Node.js", "Fastify", "JavaScript", "TypeScript", "IoT", "Distributed Systems"],
    awards: [
      "Node.js Technical Steering Committee Chair",
      "OpenJS Foundation Board Member",
    ],
    publications: [
      '"Accelerating Server-Side Development with Fastify" — Packt Publishing, 2021',
      "60+ talks at OpenJS World, NodeConf.eu, JSConf.Asia, WebRebels, JsDay",
    ],
    template: "compact",
    isReal: true,
  },

  {
    name: "TJ Holowaychuk",
    title: "Software Engineer & Open-Source Author",
    email: "tj@apex.sh",
    location: "Victoria, British Columbia, Canada",
    links: ["github.com/tj", "apex.sh"],
    summary:
      "Creator of Express.js — the most widely used Node.js web framework. Author of Koa, Mocha, Commander, and 100+ other JavaScript libraries. Founder of Apex Software.",
    experience: [
      {
        title: "Founder",
        org: "Apex Software",
        dates: "2015 – Present",
        bullets: [
          "Builds developer tooling: Apex Logs, Apex Ping, and infrastructure products",
          "Apex Up: deploy serverless functions to AWS Lambda with a single command",
        ],
      },
      {
        title: "Open-Source Engineer (Independent)",
        org: "Self-Employed",
        dates: "2010 – 2013",
        bullets: [
          "Created Express.js (2010) — now the most downloaded Node.js web framework (69k+ stars)",
          "Created Koa.js — expressive middleware using async functions (35k+ stars)",
          "Created Mocha test framework, Commander CLI library, and 100+ other packages",
          "Rights to Express.js transferred to StrongLoop (later IBM) in 2014",
        ],
      },
    ],
    education: [],
    skills: ["Node.js", "Go", "JavaScript", "TypeScript", "Systems Programming", "CLI tooling"],
    template: "modern",
    isReal: true,
  },
];

// ─── Fabricated Resumes (planted claims with ground truth) ────────────────────
// Each persona has: SUPPORTED (real verifiable facts), REFUTED (false attribution),
// SUSPICIOUS (timeline conflict / impossible metric), UNVERIFIABLE (private internal claim)

const fabricatedResumes: Resume[] = [
  // ── Persona 1: James Whitfield — DevOps/SRE ──────────────────────────────────
  // SUPPORTED:     HashiCorp Vault is a real, well-documented secrets management tool
  // REFUTED:       Claims to be the original author of the Envoy proxy (actually Matt Klein at Lyft)
  //                — requires a web search to catch; not broadly known trivia
  // SUSPICIOUS:    Held two explicit full-time SRE roles simultaneously for 2 years
  // UNVERIFIABLE:  Internal latency-reduction metric
  {
    name: "James Whitfield",
    title: "Staff Site Reliability Engineer",
    email: "james.whitfield@email.com",
    location: "Austin, TX",
    links: ["github.com/jwhitfield-dev", "linkedin.com/in/jameswhitfield"],
    summary:
      "Staff SRE and cloud infrastructure engineer specialising in service mesh, observability, and secrets management. Original author of the Envoy proxy, open-sourced by Lyft in 2016. Former SRE at Google Cloud and Datadog.",
    experience: [
      {
        title: "Principal Engineer — Infrastructure",
        org: "Cloudflare",
        dates: "2021 – Present",
        bullets: [
          "HashiCorp Vault is a widely-used open-source secrets management tool used by enterprises globally",
          "Leads zero-trust secrets management rollout using HashiCorp Vault across Cloudflare's global edge",
          "Reduced P99 API latency by 41% through eBPF-based kernel-bypass networking",
        ],
      },
      {
        title: "Staff Site Reliability Engineer",
        org: "Google Cloud",
        dates: "January 2018 – January 2020 (full-time)",
        bullets: [
          "Led SRE practices for Google Cloud's Kubernetes Engine (GKE) — on-call, incident response, capacity planning",
          "Defined SLO framework adopted across six GCP product areas",
        ],
      },
      {
        title: "Principal Engineer — Observability",
        org: "Datadog",
        dates: "January 2018 – January 2020 (full-time, concurrent with Google Cloud)",
        bullets: [
          "Simultaneously held this full-time role alongside the Google Cloud SRE position",
          "Built distributed tracing pipeline now processing 4 trillion spans per day",
        ],
      },
      {
        title: "Software Engineer",
        org: "Lyft",
        dates: "2015 – 2017",
        bullets: [
          "Original author of the Envoy proxy service mesh, open-sourced at GopherCon 2016",
          "Envoy is now a CNCF graduated project and the data-plane foundation of Istio",
        ],
      },
    ],
    education: [
      {
        title: "B.S. Computer Engineering",
        org: "University of Texas at Austin",
        dates: "2015",
        bullets: [],
      },
    ],
    skills: ["Kubernetes", "Envoy", "HashiCorp Vault", "Go", "Python", "eBPF", "Prometheus", "Terraform"],
    template: "compact",
    isReal: false,
    plantedClaims: [
      {
        text: "HashiCorp Vault is a widely-used open-source secrets management and identity-based security tool",
        expected_verdict: "SUPPORTED",
      },
      {
        text: "Original author of the Envoy proxy service mesh, open-sourced by Lyft at GopherCon 2016",
        expected_verdict: "REFUTED",
      },
      {
        text: "Simultaneously held a full-time Staff SRE role at Google Cloud and a full-time Principal Engineer role at Datadog from January 2018 to January 2020",
        expected_verdict: "SUSPICIOUS",
      },
      {
        text: "Reduced Cloudflare's P99 API latency by 41% through eBPF-based kernel-bypass networking",
        expected_verdict: "UNVERIFIABLE",
      },
    ],
  },

  // ── Persona 2: Sofia Larsson — ML Researcher ─────────────────────────────────
  // SUPPORTED:     DeepMind's AlphaFold 2 breakthrough at CASP14 is a documented public fact
  // REFUTED:       Claims co-authorship on 'Scaling Laws for Neural Language Models' (Kaplan et al., OpenAI 2020)
  //                — real paper with a specific named author list; Sofia is not among them
  //                — requires searching the paper to catch; not trivia
  // SUSPICIOUS:    Led 40 researchers at a 15-person startup — more people than exist at the company
  // UNVERIFIABLE:  Internal inference throughput improvement at Cohere
  {
    name: "Sofia Larsson",
    title: "Senior Machine Learning Researcher",
    email: "sofia.larsson@email.com",
    location: "London, UK",
    links: ["github.com/slarsson-ml", "scholar.google.com/citations?user=slarsson"],
    summary:
      "ML researcher with a focus on large language model scaling and protein structure prediction. Contributed to AlphaFold research at DeepMind. Co-authored foundational scaling-laws research at OpenAI. Currently Senior Research Scientist at Cohere.",
    experience: [
      {
        title: "Senior Research Scientist",
        org: "Cohere",
        dates: "2022 – Present",
        bullets: [
          "Leads research on efficient fine-tuning and inference optimisation for the Command model family",
          "Improved Command model inference throughput by 38% through quantization-aware training",
        ],
      },
      {
        title: "Research Engineer",
        org: "BioML Labs (Seed stage, 15 employees)",
        dates: "2021 – 2022",
        bullets: [
          "Led a team of 40 ML researchers and engineers at this 15-person seed-stage startup",
          "Built protein property prediction pipeline processing 2 million sequences per day",
        ],
      },
      {
        title: "Research Scientist",
        org: "OpenAI",
        dates: "2019 – 2021",
        bullets: [
          "Co-authored 'Scaling Laws for Neural Language Models' (Kaplan, McCandlish et al., 2020) on neural language model scaling behaviour",
          "Contributed to early GPT-3 pre-training infrastructure and evaluation pipelines",
        ],
      },
      {
        title: "Research Engineer",
        org: "DeepMind",
        dates: "2016 – 2019",
        bullets: [
          "DeepMind's AlphaFold 2 achieved a breakthrough in protein structure prediction at CASP14 in 2020, solving a 50-year-old grand challenge in biology",
          "Contributed to early structure prediction research that fed into the AlphaFold project",
        ],
      },
    ],
    education: [
      {
        title: "M.Sc. Machine Learning",
        org: "KTH Royal Institute of Technology",
        dates: "2016",
        bullets: [],
      },
      {
        title: "B.Sc. Computer Science",
        org: "Uppsala University",
        dates: "2014",
        bullets: [],
      },
    ],
    skills: ["PyTorch", "JAX", "Python", "CUDA", "C++", "Distributed Training", "Protein Structure Prediction"],
    template: "modern",
    isReal: false,
    plantedClaims: [
      {
        text: "DeepMind's AlphaFold 2 achieved a breakthrough in protein structure prediction at CASP14 in 2020",
        expected_verdict: "SUPPORTED",
      },
      {
        text: "Co-authored 'Scaling Laws for Neural Language Models' (Kaplan, McCandlish et al., OpenAI Technical Report, 2020)",
        expected_verdict: "REFUTED",
      },
      {
        text: "Led a team of 40 ML researchers and engineers at BioML Labs, a seed-stage startup with only 15 total employees",
        expected_verdict: "SUSPICIOUS",
      },
      {
        text: "Improved Cohere's Command model inference throughput by 38% through quantization-aware training",
        expected_verdict: "UNVERIFIABLE",
      },
    ],
  },

  // ── Persona 3: Carlos Mendez — Product Manager ───────────────────────────────
  // SUPPORTED:     Stripe's founding story (Patrick + John Collison, 2010) is well-documented
  // REFUTED:       Claims co-authorship of 'Inspired' by Marty Cagan — it is a solely-authored PM book
  //                — requires a web search to verify authorship; not broad trivia
  // SUSPICIOUS:    Sole PM at 12-person company directing 80 engineers, $50M ARR in 10 months
  // UNVERIFIABLE:  Internal conversion-rate improvement at Stripe
  {
    name: "Carlos Mendez",
    title: "Senior Product Manager",
    email: "carlos.mendez@email.com",
    location: "Miami, FL",
    links: ["linkedin.com/in/carlosmendezpm"],
    summary:
      "Product leader specialising in developer tools and payments infrastructure. Former PM at Stripe and Figma. Co-authored 'Inspired: How to Create Tech Products Customers Love' (Wiley, 2018) with Marty Cagan. MBA from Wharton.",
    experience: [
      {
        title: "Head of Product",
        org: "BuiltFast (Series A, 12 employees)",
        dates: "2022 – Present",
        bullets: [
          "As the sole PM at a 12-person company, directed a product roadmap executed by 80 engineers across three contracted development firms",
          "Grew ARR from $0 to $50 million in 10 months with no dedicated sales team at this 12-person company",
        ],
      },
      {
        title: "Senior Product Manager — Developer Platform",
        org: "Figma",
        dates: "2019 – 2022",
        bullets: [
          "PM for Figma's REST API, developer handoff tooling, and Plugins marketplace",
          "Launched Figma Plugins from zero to 500+ community-built plugins within 6 months of open beta",
        ],
      },
      {
        title: "Product Manager — Payments",
        org: "Stripe",
        dates: "2016 – 2019",
        bullets: [
          "Stripe was founded in 2010 by Patrick Collison and John Collison and processes payments for millions of businesses worldwide",
          "Owned checkout conversion optimisation; increased conversion rate by 18% through A/B tested payment flow redesign",
        ],
      },
    ],
    education: [
      {
        title: "MBA",
        org: "Wharton School, University of Pennsylvania",
        dates: "2016",
        bullets: [],
      },
      {
        title: "B.S. Industrial Engineering",
        org: "University of Florida",
        dates: "2013",
        bullets: [],
      },
    ],
    skills: ["Product Strategy", "Roadmapping", "SQL", "A/B Testing", "User Research", "OKRs", "Payments"],
    template: "classic",
    isReal: false,
    plantedClaims: [
      {
        text: "Stripe was founded in 2010 by Patrick Collison and John Collison and processes payments for millions of businesses",
        expected_verdict: "SUPPORTED",
      },
      {
        text: "Co-authored 'Inspired: How to Create Tech Products Customers Love' (Wiley, 2018) with Marty Cagan",
        expected_verdict: "REFUTED",
      },
      {
        text: "As the sole PM at BuiltFast, a 12-person company, directed a product roadmap executed by 80 engineers and grew ARR from $0 to $50M in 10 months",
        expected_verdict: "SUSPICIOUS",
      },
      {
        text: "Increased Stripe checkout conversion rate by 18% through A/B tested redesign of the payment confirmation flow",
        expected_verdict: "UNVERIFIABLE",
      },
    ],
  },

  // ── Persona 4: Emma Johansson — Frontend Engineer ────────────────────────────
  // SUPPORTED:     Next.js is a real, well-documented React framework built by Vercel
  // REFUTED:       Claims to have created Vite (actually Evan You, creator of Vue.js, in 2020)
  //                — requires a web search; not pop trivia in the way "created React" would be
  // SUSPICIOUS:    Full-time Staff Engineer at Linear AND full-time role at Vercel simultaneously
  // UNVERIFIABLE:  Internal bundle-size reduction metric
  {
    name: "Emma Johansson",
    title: "Staff Frontend Engineer",
    email: "emma.johansson@email.com",
    location: "Berlin, Germany",
    links: ["github.com/emmajohansson", "emmajohansson.dev"],
    summary:
      "Staff Frontend Engineer specialising in build tooling, performance engineering, and design systems. Created Vite, the next-generation JavaScript build tool used by Vue, Svelte, and React projects. Currently Staff Engineer at Linear. Previously at Vercel and Shopify.",
    experience: [
      {
        title: "Staff Frontend Engineer",
        org: "Linear",
        dates: "January 2022 – Present (full-time)",
        bullets: [
          "Next.js is a real open-source React framework created by Vercel with over 120,000 GitHub stars",
          "Leads frontend architecture for Linear's web and Electron desktop applications",
          "Reduced bundle size by 43% through component-level code splitting and dynamic imports",
          "Simultaneously serving as a full-time Core Framework Engineer on the Next.js team at Vercel (January 2022 – present)",
        ],
      },
      {
        title: "Software Engineer — Build Infrastructure",
        org: "Vercel",
        dates: "2019 – 2022",
        bullets: [
          "Created Vite, the next-generation frontend build tool now used by Vue, Svelte, SvelteKit, and Vitest (released 2020)",
          "Contributed to Next.js compiler pipeline and edge runtime improvements",
        ],
      },
      {
        title: "Frontend Engineer",
        org: "Shopify",
        dates: "2016 – 2019",
        bullets: [
          "Frontend engineer on Shopify's storefront rendering and theme tooling",
          "Built Polaris component library extensions adopted across 12 product teams",
        ],
      },
    ],
    education: [
      {
        title: "M.Sc. Computer Science",
        org: "KTH Royal Institute of Technology",
        dates: "2016",
        bullets: [],
      },
    ],
    skills: ["React", "TypeScript", "Vite", "Webpack", "CSS", "WebAssembly", "Electron", "Performance Engineering"],
    template: "classic",
    isReal: false,
    plantedClaims: [
      {
        text: "Next.js is a real open-source React framework created by Vercel with over 120,000 GitHub stars",
        expected_verdict: "SUPPORTED",
      },
      {
        text: "Created Vite, the next-generation JavaScript build tool used by Vue, Svelte, and React projects (released 2020)",
        expected_verdict: "REFUTED",
      },
      {
        text: "Simultaneously holds a full-time Staff Engineer role at Linear and a full-time Core Framework Engineer role at Vercel on the Next.js team since January 2022",
        expected_verdict: "SUSPICIOUS",
      },
      {
        text: "Reduced bundle size by 43% at Linear through component-level code splitting and dynamic imports",
        expected_verdict: "UNVERIFIABLE",
      },
    ],
  },
];

// ─── PDF Rendering ────────────────────────────────────────────────────────────

const MARGIN = 52;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Accent colours per template
const ACCENT = {
  classic: "#1a1a1a",
  modern: "#2563EB",
  compact: "#059669",
};

function rule(doc: PDFKit.PDFDocument, color = "#cccccc") {
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).strokeColor(color).lineWidth(0.5).stroke();
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string, template: Template) {
  doc.moveDown(0.6);
  if (template === "classic") {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(ACCENT.classic)
      .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 1.2 });
    doc.moveDown(0.15);
    rule(doc, "#999999");
    doc.moveDown(0.3);
  } else if (template === "modern") {
    doc.rect(MARGIN, doc.y, 3, 12).fill(ACCENT.modern);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(ACCENT.modern)
      .text(title.toUpperCase(), MARGIN + 9, doc.y - 10, { characterSpacing: 1 });
    doc.moveDown(0.5);
  } else {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(ACCENT.compact)
      .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 1.5 });
    doc.moveDown(0.1);
    rule(doc, ACCENT.compact);
    doc.moveDown(0.25);
  }
}

function entryHeader(doc: PDFKit.PDFDocument, title: string, org: string, dates: string) {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(title, MARGIN, y);
  doc.font("Helvetica").fontSize(9).fillColor("#555555")
    .text(dates, MARGIN, y, { align: "right", width: CONTENT_WIDTH });
  doc.font("Helvetica").fontSize(9.5).fillColor("#333333").text(org);
  doc.moveDown(0.15);
}

function bullet(doc: PDFKit.PDFDocument, text: string) {
  const x = MARGIN + 12;
  const width = CONTENT_WIDTH - 14;
  doc.font("Helvetica").fontSize(9.5).fillColor("#222222")
    .text(`• ${text}`, x, doc.y, { width, indent: 0 });
}

function renderResume(resume: Resume, outputPath: string): Promise<void> {
  // compress: false forces a traditional XRef table; pdf-parse (pdf.js) can't parse compressed XRef streams
  const doc = new PDFDocument({ margin: MARGIN, size: "LETTER", compress: false, info: { Title: `${resume.name} — Resume` } });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const accent = ACCENT[resume.template];

  // ── Header ──────────────────────────────────────────────────────────────────
  if (resume.template === "modern") {
    doc.rect(0, 0, PAGE_WIDTH, 90).fill(accent);
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#ffffff")
      .text(resume.name, MARGIN, 22, { width: CONTENT_WIDTH });
    doc.font("Helvetica").fontSize(11).fillColor("#dbeafe")
      .text(resume.title, MARGIN, doc.y + 2);
    const contact = [resume.email, resume.location, ...resume.links].join("  ·  ");
    doc.fontSize(8.5).fillColor("#bfdbfe").text(contact, MARGIN, doc.y + 4);
    doc.y = 102;
  } else if (resume.template === "classic") {
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#111111")
      .text(resume.name, MARGIN, MARGIN, { align: "center", width: CONTENT_WIDTH });
    doc.font("Helvetica").fontSize(10).fillColor("#444444")
      .text(resume.title, MARGIN, doc.y + 2, { align: "center", width: CONTENT_WIDTH });
    const contact = [resume.email, resume.location, ...resume.links].join("  |  ");
    doc.fontSize(9).fillColor("#666666")
      .text(contact, MARGIN, doc.y + 3, { align: "center", width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    rule(doc, "#333333");
    doc.moveDown(0.4);
  } else {
    // compact
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#111111").text(resume.name, MARGIN, MARGIN);
    doc.font("Helvetica").fontSize(10).fillColor(accent).text(resume.title, MARGIN, doc.y + 1);
    const contact = [resume.email, resume.location, ...resume.links].join("  ·  ");
    doc.fontSize(8.5).fillColor("#666666").text(contact, MARGIN, doc.y + 2);
    doc.moveDown(0.4);
    doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 1.5).fill(accent);
    doc.moveDown(0.5);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (resume.summary) {
    sectionHeader(doc, "Summary", resume.template);
    doc.font("Helvetica").fontSize(9.5).fillColor("#333333")
      .text(resume.summary, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 1.5 });
    doc.moveDown(0.3);
  }

  // ── Experience ───────────────────────────────────────────────────────────────
  if (resume.experience.length > 0) {
    sectionHeader(doc, "Experience", resume.template);
    for (const entry of resume.experience) {
      entryHeader(doc, entry.title, entry.org, entry.dates);
      for (const b of entry.bullets) bullet(doc, b);
      doc.moveDown(0.5);
    }
  }

  // ── Education ────────────────────────────────────────────────────────────────
  if (resume.education.length > 0) {
    sectionHeader(doc, "Education", resume.template);
    for (const entry of resume.education) {
      entryHeader(doc, entry.title, entry.org, entry.dates);
      for (const b of entry.bullets) bullet(doc, b);
      doc.moveDown(0.3);
    }
  }

  // ── Skills ───────────────────────────────────────────────────────────────────
  if (resume.skills?.length) {
    sectionHeader(doc, "Skills", resume.template);
    doc.font("Helvetica").fontSize(9.5).fillColor("#333333")
      .text(resume.skills.join("  ·  "), MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
  }

  // ── Awards ───────────────────────────────────────────────────────────────────
  if (resume.awards?.length) {
    sectionHeader(doc, "Awards & Recognition", resume.template);
    for (const a of resume.awards) bullet(doc, a);
    doc.moveDown(0.3);
  }

  // ── Publications ─────────────────────────────────────────────────────────────
  if (resume.publications?.length) {
    sectionHeader(doc, "Publications & Talks", resume.template);
    for (const p of resume.publications) bullet(doc, p);
    doc.moveDown(0.3);
  }

  doc.end();
  return new Promise<void>((resolve) => stream.on("finish", resolve));
}

// ─── Ground-truth JSON ────────────────────────────────────────────────────────

function buildGroundTruth(resumes: Resume[]) {
  const out: Array<{
    candidate_name: string;
    claim_text: string;
    expected_verdict: string;
  }> = [];

  for (const r of resumes) {
    if (r.plantedClaims) {
      for (const c of r.plantedClaims) {
        out.push({ candidate_name: r.name, claim_text: c.text, expected_verdict: c.expected_verdict });
      }
    }
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const outDir = path.join(process.cwd(), "scripts", "resumes");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const all = [...realResumes, ...fabricatedResumes];
  console.log(`Generating ${all.length} resume PDFs → ${outDir}/`);

  for (const resume of all) {
    const filename = resume.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") + ".pdf";
    const tag = resume.isReal ? "[real]   " : "[fabricated]";
    await renderResume(resume, path.join(outDir, filename));
    console.log(`  ✓ ${tag} ${filename}`);
  }

  // Write companion ground-truth JSON
  const gt = buildGroundTruth(fabricatedResumes);
  const gtPath = path.join(outDir, "ground-truth.json");
  fs.writeFileSync(gtPath, JSON.stringify(gt, null, 2));

  const counts = {
    SUPPORTED: gt.filter((c) => c.expected_verdict === "SUPPORTED").length,
    REFUTED: gt.filter((c) => c.expected_verdict === "REFUTED").length,
    SUSPICIOUS: gt.filter((c) => c.expected_verdict === "SUSPICIOUS").length,
    UNVERIFIABLE: gt.filter((c) => c.expected_verdict === "UNVERIFIABLE").length,
  };

  console.log(`\n✓ ground-truth.json → ${gtPath}`);
  console.log(`  ${gt.length} labeled claims across ${fabricatedResumes.length} fabricated resumes`);
  console.log(`  SUPPORTED:    ${counts.SUPPORTED}`);
  console.log(`  REFUTED:      ${counts.REFUTED}`);
  console.log(`  SUSPICIOUS:   ${counts.SUSPICIOUS}`);
  console.log(`  UNVERIFIABLE: ${counts.UNVERIFIABLE}`);
  console.log(`\nNext: Upload PDFs via the UI → run swarm → import ground-truth.json on the Accuracy page`);
}

main().catch(console.error);
