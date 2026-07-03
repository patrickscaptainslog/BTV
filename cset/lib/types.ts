export type Subtest = 1 | 2;

/** SMR domain codes: "1" Number & Quantity, "2" Algebra, "3" Geometry, "4" Probability & Statistics */
export type DomainCode = "1" | "2" | "3" | "4";

/** SMR subdomain codes, e.g. "2.3" = Functions */
export type SubdomainCode =
  | "1.1" | "1.2"
  | "2.1" | "2.2" | "2.3" | "2.4"
  | "3.1" | "3.2" | "3.3" | "3.4"
  | "4.1" | "4.2";

export interface MCItem {
  id: string;
  type: "mc";
  subtest: Subtest;
  domain: DomainCode;
  subdomain: SubdomainCode;
  /** Elo-style difficulty rating; 1200 ≈ borderline-pass candidate gets it right half the time */
  difficulty: number;
  /** Plain text with $...$ / $$...$$ LaTeX segments */
  stem: string;
  choices: string[];
  /** Index into choices */
  key: number;
  workedSolution: string;
  tags: string[];
  source: { kind: "generated"; generatorId: string; seed: number } | { kind: "curated" };
}

export interface CRItem {
  id: string;
  type: "cr";
  subtest: Subtest;
  domain: DomainCode;
  subdomain: SubdomainCode;
  difficulty: number;
  stem: string;
  /** A complete response that would earn a 4 on the focused holistic scale */
  modelAnswer: string;
  tags: string[];
}

export type Item = MCItem | CRItem;

export interface Attempt {
  itemId: string;
  subtest: Subtest;
  domain: DomainCode;
  subdomain: SubdomainCode;
  correct: boolean;
  chosen: number;
  /** ms spent on the question */
  elapsed: number;
  at: number; // epoch ms
  mode: "diagnostic" | "drill" | "exam" | "review";
}

export interface RatingState {
  /** per-subdomain user rating */
  user: Record<string, number>;
  /** per-item rating adjustments learned from attempts (delta on top of authored difficulty) */
  itemDelta: Record<string, number>;
}

export interface ReviewState {
  /** epoch ms when the item is due again */
  due: number;
  /** current interval in days */
  intervalDays: number;
  ease: number;
  lapses: number;
}

export interface FlagEntry {
  itemId: string;
  reason: string;
  at: number;
}

export interface ExamResult {
  id: string;
  subtest: Subtest;
  startedAt: number;
  finishedAt: number;
  mcItemIds: string[];
  mcAnswers: (number | null)[];
  mcCorrect: number;
  crItemIds: string[];
  crResponses: string[];
  crScores: (number | null)[];
  /** estimated scaled score out of 300 (>=220 passes) */
  estimatedScaled: number;
}

export interface CRGrade {
  score: 1 | 2 | 3 | 4;
  justification: string;
  feedback: string;
}
