import type { Confidence, Kind } from './types';

export interface KindInfo {
  label: string;
  /** One-line explanation shown in pickers. */
  hint: string;
  /** Whether a confidence level makes sense for this kind. */
  hasConfidence: boolean;
}

export const KIND_INFO: Record<Kind, KindInfo> = {
  idea: { label: 'Idea', hint: 'Something you could make, try or do', hasConfidence: true },
  insight: { label: 'Insight', hint: 'Something you realized, noticed or learned', hasConfidence: true },
  belief: { label: 'Belief', hint: 'How you think the world works', hasConfidence: true },
  value: { label: 'Value', hint: 'Something you live by', hasConfidence: true },
  practice: { label: 'Practice', hint: 'Something you do, or mean to do, because it helps', hasConfidence: true },
  fact: { label: 'Fact', hint: 'Checked, true and worth remembering', hasConfidence: true },
  tip: { label: 'Tip', hint: 'Practical know-how', hasConfidence: true },
  speculation: { label: 'Speculation', hint: 'A hunch about how things are or will be', hasConfidence: true },
  question: { label: 'Question', hint: "An open question you're carrying", hasConfidence: false },
  quote: { label: 'Quote', hint: "Someone else's words that stuck", hasConfidence: false },
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  hunch: 'Hunch',
  leaning: 'Leaning',
  confident: 'Confident',
  conviction: 'Conviction',
};

const QUOTE_CHARS = /^["“'‘«]/;
const ATTRIBUTION = /(?:^|\n|\s)(?:—|–|--|-)\s*[A-Z][^\n]{1,80}$/;

const STARTS: Array<[RegExp, Kind]> = [
  [/^(i|we) (believe|think)\b/, 'belief'],
  [/^i (want to|will|try to) (always|never)\b/, 'value'],
  // Practices: habits and personal rules ("I try to…", "Every morning…", "No phone after…").
  [/^i (try to|make sure|always|never|don'?t|do not|aim to|stick to)\b/, 'practice'],
  [/^(every|each) (day|morning|night|evening|week|weekday|weekend)\b/, 'practice'],
  [/^(no|limit) (phone|phones|screens?|social media|caffeine|coffee|alcohol|sugar|email|news)\b/, 'practice'],
  [/^(in bed by|wake up at|get up at|go to bed)\b/, 'practice'],
  [/^(always|never)\b/, 'value'],
  // General "don't" advice is know-how for anyone.
  [/^(don'?t|do not|avoid)\b/, 'tip'],
  [/^(i|we) (value|stand for)\b/, 'value'],
  [/^(maybe|perhaps|i (bet|suspect|wonder if|guess))\b/, 'speculation'],
  [/^(i (learned|realized|noticed)|turns out|lesson:)/, 'insight'],
  [/^(tip:|how to\b|to [a-z]+ .*, (use|try|do)\b)/, 'tip'],
  [/^(idea:|what if\b|we could\b|i could\b|someone should\b)/, 'idea'],
  [/^(fact:|did you know\b)/, 'fact'],
];

/**
 * Guess a kind from the text of a new grain, or undefined when there's no
 * good guess. Only a suggestion: the UI pre-selects it and the user can
 * change it. Deliberately conservative — a wrong guess is worse than none.
 */
export function suggestKind(text: string): Kind | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (QUOTE_CHARS.test(t) && ATTRIBUTION.test(t)) return 'quote';
  if (/\?\s*$/.test(t) && !t.includes('\n\n')) return 'question';
  const lower = t.toLowerCase();
  for (const [re, kind] of STARTS) if (re.test(lower)) return kind;
  return undefined;
}
