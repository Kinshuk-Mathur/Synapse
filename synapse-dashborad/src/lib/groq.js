import Groq from "groq-sdk";

export const GROQ_MODEL_KEYS = {
  GENERAL: "general",
  REASONING: "reasoning",
  LIGHTWEIGHT: "lightweight"
};

export const GROQ_MODELS = [
  {
    key: GROQ_MODEL_KEYS.GENERAL,
    name: "Llama 3.3 70B",
    label: "General Chat",
    id: "llama-3.3-70b-versatile"
  },
  {
    key: GROQ_MODEL_KEYS.REASONING,
    name: "Llama 4 Scout",
    label: "Reasoning",
    id: "meta-llama/llama-4-scout-17b-16e-instruct"
  },
  {
    key: GROQ_MODEL_KEYS.LIGHTWEIGHT,
    name: "Llama 3.1 8B Instant",
    label: "Lightweight",
    id: "llama-3.1-8b-instant"
  }
];

export function createGroqClient(options = {}) {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Groq({
    apiKey,
    maxRetries: options.maxRetries ?? 0,
    timeout: options.timeout ?? 22_000
  });
}

export function getGroqModelByKey(key) {
  return GROQ_MODELS.find((model) => model.key === key) || GROQ_MODELS[0];
}

export function orderGroqModels(primaryKey = GROQ_MODEL_KEYS.GENERAL) {
  const primary = getGroqModelByKey(primaryKey);
  const fallbackOrder = [
    GROQ_MODEL_KEYS.GENERAL,
    GROQ_MODEL_KEYS.REASONING,
    GROQ_MODEL_KEYS.LIGHTWEIGHT
  ]
    .map(getGroqModelByKey)
    .filter((model) => model.id !== primary.id);

  return [primary, ...fallbackOrder];
}
