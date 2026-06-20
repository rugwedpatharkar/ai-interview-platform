import type { LucideIcon } from "lucide-react";
import {
  Bell,
  ShieldCheck,
  Scale,
  Search,
  Video,
  MessageSquareText,
  CheckCircle2,
  Sparkles,
  Building2,
  UserCheck,
} from "lucide-react";

// The "I'm hiring" fork + company feature CTA deep-link the company app. Configurable so the
// candidate origin never hard-codes a company hostname. Declared first — FEATURES references it.
export const COMPANY_HIRE_HREF =
  process.env.NEXT_PUBLIC_COMPANY_URL ?? "http://localhost:3001";

export const HERO = {
  eyebrow: "Unified hiring platform",
  h1: "Get seen. Get interviewed. Get hired.",
  subhead: "One place to apply, interview, and hear back — on a result you can trust.",
  // Trust microcopy — fairness framing, NOT scrutiny.
  micro: [
    "Free for candidates",
    "Proctored & fair — same rules for everyone",
    "Every application gets an answer",
  ],
} as const;

export interface Stat {
  value: string;
  label: string;
}
export const STATS: Stat[] = [
  { value: "100%", label: "of applications answered" },
  { value: "12,400+", label: "interviews completed" },
  { value: "1", label: "fair interview — live video + voice" },
  { value: "3-day", label: "average feedback" },
];

export interface Diff {
  key: "answered" | "cheatproof" | "merit";
  icon: LucideIcon;
  title: string;
  body: string;
}
export const DIFFERENTIATORS: Diff[] = [
  {
    key: "answered",
    icon: Bell,
    title: "Answered, always",
    body: "Every application gets a real response — no ghosting, ever.",
  },
  {
    key: "cheatproof",
    icon: ShieldCheck,
    title: "Cheat-proof",
    body: "A rigorously proctored interview — same rules for everyone — so a pass means something.",
  },
  {
    key: "merit",
    icon: Scale,
    title: "On merit",
    body: "Judged on evidence from the interview, not pedigree or who you know.",
  },
];

export interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}
export const STEPS: Step[] = [
  { icon: Search, title: "Search & apply", body: "Find roles that fit and apply in a click." },
  {
    icon: Video,
    title: "Take your live interview",
    body: "A single proctored live video + voice interview — same for everyone.",
  },
  {
    icon: MessageSquareText,
    title: "Get evidence-based feedback",
    body: "See how you did, grounded in what you actually said.",
  },
  { icon: CheckCircle2, title: "Hear back, always", body: "A real answer on every application." },
];

export interface FlowNode {
  icon: LucideIcon;
  label: string;
}
export const MERIT_FLOW: FlowNode[] = [
  { icon: Video, label: "Evidence captured" },
  { icon: Sparkles, label: "AI structures it" },
  { icon: UserCheck, label: "A human decides" },
  { icon: Bell, label: "You're notified" },
];

export interface FeatureCol {
  audience: "candidates" | "companies";
  icon: LucideIcon;
  title: string;
  items: string[];
  cta: { label: string; href: string };
}
export const FEATURES: FeatureCol[] = [
  {
    audience: "candidates",
    icon: Sparkles,
    title: "For candidates",
    items: [
      "Live video + voice interview",
      "Private practice runs",
      "Skill-gap feedback",
      "Real-time application status",
    ],
    cta: { label: "Find your next job", href: "/jobs" },
  },
  {
    audience: "companies",
    icon: Building2,
    title: "For companies",
    items: [
      "Merit-based screening",
      "Advisory gate — you decide",
      "Evidence-based reports",
      "No-ghosting analytics",
    ],
    cta: { label: "Start hiring on merit", href: COMPANY_HIRE_HREF },
  },
];

export const VALUE_PILLS = [
  "SOC 2",
  "GDPR-ready",
  "EEOC-aligned",
  "Bias-tested",
  "Proctored integrity",
  "Human-in-the-loop",
  "Audit trail",
] as const;

export interface Quote {
  body: string;
  name: string;
  role: string;
}
export const TESTIMONIALS: Quote[] = [
  {
    body: "I applied, interviewed, and heard back in days — with actual feedback. Unheard of.",
    name: "Representative candidate",
    role: "Hired in 1 week",
  },
  {
    body: "We screen on merit at volume now, and our response rate is 100%. Our rating climbed.",
    name: "Representative recruiter",
    role: "Talent lead",
  },
];

export const FOOTER_TAGLINE = "Proctored. No ghosting. On merit.";
