import { GROQ_MODEL_KEYS, getGroqModelByKey } from "../groq.js";

/**
 * @typedef {ReturnType<typeof getGroqModelByKey>} GroqModel
 */

const PROMPT_TYPES = {
  GENERAL: "general",
  REASONING: "reasoning",
  LIGHTWEIGHT: "lightweight"
};

const ROUTE_RULES = [
  {
    promptType: PROMPT_TYPES.REASONING,
    modelKey: GROQ_MODEL_KEYS.REASONING,
    patterns: [
      /\bcode\b/,
      /\bcoding\b/,
      /\bbug\b/,
      /\bdebug(?:ging)?\b/,
      /\balgorithms?\b/,
      /\bdsa\b/,
      /\barrays?\b/,
      /\blinked\s+lists?\b/,
      /\btrees?\b/,
      /\bgraphs?\b/,
      /\brecursion\b/,
      /\bpython\b/,
      /\bjavascript\b/,
      /\breact\b/,
      /\bnext\s*\.?\s*js\b/,
      /\bnextjs\b/,
      /\bfirebase\b/,
      /\bmath\b/,
      /\bmaths\b/,
      /\bphysics\b/,
      /\bchemistry\b/,
      /\bexplain\s+deeply\b/,
      /\bdetailed\s+explanation\b/,
      /\blong\s+explanation\b/,
      /\bdeep\s+concept\b/,
      /\bstartup\s+strategy\b/,
      /\bstartup\s+analysis\b/,
      /\bbusiness\s+strategy\b/,
      /\bsystem\s+design\b/,
      /\barchitecture\b/,
      /\bresearch\s+questions?\b/
    ]
  },
  {
    promptType: PROMPT_TYPES.LIGHTWEIGHT,
    modelKey: GROQ_MODEL_KEYS.LIGHTWEIGHT,
    patterns: [
      /\bsummarize\s+this\b/,
      /\bsummarise\s+this\b/,
      /\brewrite\s+this\b/,
      /\bfix\s+grammar\b/,
      /\b(?:generate|write)\s+(?:a\s+)?caption\b/,
      /\bcaption\s+for\b/,
      /\bmake\s+(?:a\s+)?title\b/,
      /\bshorten\s+(?:this\s+)?text\b/,
      /\bquick\s+answer\b/,
      /\bone\s+line\s+answer\b/
    ]
  }
];

function normalizePrompt(userPrompt = "") {
  return String(userPrompt || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchRoute(normalizedPrompt) {
  return ROUTE_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalizedPrompt))
  );
}

export function classifyModelPrompt(userPrompt = "") {
  const normalizedPrompt = normalizePrompt(userPrompt);
  const matchedRule = matchRoute(normalizedPrompt);

  if (matchedRule) {
    return {
      promptType: matchedRule.promptType,
      modelKey: matchedRule.modelKey
    };
  }

  return {
    promptType: PROMPT_TYPES.GENERAL,
    modelKey: GROQ_MODEL_KEYS.GENERAL
  };
}

export function getAiRouterDecision(userPrompt = "") {
  const classification = classifyModelPrompt(userPrompt);
  const model = getGroqModelByKey(classification.modelKey);

  return {
    ...classification,
    model
  };
}

/**
 * Selects the best Groq model for the user's latest prompt.
 *
 * @param {string} userPrompt
 * @returns {GroqModel}
 */
export function selectModelForPrompt(userPrompt = "") {
  return getAiRouterDecision(userPrompt).model;
}

export { PROMPT_TYPES, ROUTE_RULES };
