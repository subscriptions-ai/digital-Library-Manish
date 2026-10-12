/**
 * Public AI assistant settings, read from the environment on every call so a change takes effect on the next
 * request and a test can set them. All server-side; nothing here reaches the browser.
 */
const whole = (key: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/** The fast, low-latency model the public assistant uses unless AI_ASSISTANT_MODEL names another one. */
export const DEFAULT_ASSISTANT_MODEL = 'gemini-3.5-flash-lite';

export function aiConfig() {
  const budget = process.env.AI_ASSISTANT_THINKING_BUDGET;
  return {
    /** Questions an anonymous visitor may ask per window. */
    anonymousQuestions: whole('AI_ANONYMOUS_QUESTIONS_PER_HOUR', 4, 1, 1000),
    /** Length of that window, in minutes. It rolls: each question frees its place this long after it was asked. */
    windowMinutes: whole('AI_ANONYMOUS_WINDOW_MINUTES', 60, 1, 24 * 60),
    /** Questions a visitor who has shared their details may ask in the same window. */
    leadQuestions: whole('AI_LEAD_QUESTIONS_PER_HOUR', 12, 1, 1000),
    /** Abuse backstop only, shared by everyone behind one address (an institution): model calls per IP per window. */
    ipQuestions: whole('AI_IP_QUESTIONS_PER_HOUR', 60, 1, 100000),
    timeoutMs: whole('AI_ASSISTANT_TIMEOUT_MS', 8000, 1000, 120000),
    model: (process.env.AI_ASSISTANT_MODEL || '').trim() || DEFAULT_ASSISTANT_MODEL,
    maxOutputTokens: whole('AI_ASSISTANT_MAX_OUTPUT_TOKENS', 320, 64, 4096),
    /** Earlier chat messages sent with a question (the previous question and its answer is 2). */
    historyMessages: whole('AI_ASSISTANT_HISTORY_MESSAGES', 2, 0, 10),
    /** Tool rounds per question. One covers "look it up, then answer"; two is the ceiling. */
    maxToolRounds: whole('AI_ASSISTANT_MAX_TOOL_ROUNDS', 1, 0, 2),
    /** Only for models that think by default: their thinking tokens count against the output cap. 0 turns it off where the model allows. */
    thinkingBudget: budget !== undefined && budget.trim() !== '' && Number.isInteger(Number(budget)) ? Number(budget) : null,
  };
}
