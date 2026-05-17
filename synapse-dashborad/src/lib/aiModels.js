export const SYNAPSE_AI_BUSY_MESSAGE =
  "SYNAPSE AI is currently busy. Please try again shortly.";

export const AI_MODELS = [
  {
    name: "DeepSeek",
    id: "deepseek/deepseek-chat-v3-0324:free"
  },
  {
    name: "Llama",
    id: "meta-llama/llama-3.3-8b-instruct:free"
  },
  {
    name: "Mistral",
    id: "mistralai/mistral-7b-instruct:free"
  }
];

export const AI_ROUTER_CONFIG = {
  timeoutMs: 18_000,
  retriesPerModel: 1,
  maxMessages: 12,
  maxContentLength: 12_000,
  temperature: 0.35,
  maxTokens: 1_500
};

export function normalizeChatMessages(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message?.role === "user" || message?.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: String(message.content || "")
        .replace(/\u0000/g, "")
        .slice(0, AI_ROUTER_CONFIG.maxContentLength)
    }))
    .filter((message) => message.content.trim())
    .slice(-AI_ROUTER_CONFIG.maxMessages);
}

export function buildOpenRouterMessages(systemPrompt, messages) {
  return [
    {
      role: "system",
      content: systemPrompt
    },
    ...normalizeChatMessages(messages)
  ];
}

function isHtmlErrorResponse(value) {
  const trimmed = String(value || "").trim();
  return /^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

function getErrorStatus(error) {
  return error?.status || error?.response?.status || error?.cause?.status || null;
}

function describeFailure(error) {
  const status = getErrorStatus(error);
  const message =
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    "Unknown AI provider error";

  return status ? `${status} ${message}` : message;
}

function extractAssistantMessage(completion) {
  const content = completion?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Invalid response: missing assistant message.");
  }

  const trimmed = content.trim();

  if (!trimmed || isHtmlErrorResponse(trimmed)) {
    throw new Error("Invalid response: provider returned unusable content.");
  }

  return trimmed;
}

async function requestWithTimeout(openai, model, messages, timeoutMs) {
  const controller = new AbortController();
  let timeout = null;

  try {
    const completion = await Promise.race([
      openai.chat.completions.create(
        {
          model: model.id,
          messages,
          temperature: AI_ROUTER_CONFIG.temperature,
          max_tokens: AI_ROUTER_CONFIG.maxTokens
        },
        {
          signal: controller.signal
        }
      ),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`${model.name} timed out.`));
        }, timeoutMs);
      })
    ]);

    return completion;
  } finally {
    clearTimeout(timeout);
  }
}

export async function routeCompletionThroughModels(openai, messages, options = {}) {
  const models = options.models || AI_MODELS;
  const retriesPerModel = options.retriesPerModel ?? AI_ROUTER_CONFIG.retriesPerModel;
  const timeoutMs = options.timeoutMs ?? AI_ROUTER_CONFIG.timeoutMs;
  const logger = options.logger || console;
  let lastError = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];

    if (modelIndex > 0) {
      logger.info(`Switching to ${model.name}`);
    }

    for (let attempt = 0; attempt <= retriesPerModel; attempt += 1) {
      try {
        logger.info(`Using model: ${model.name}`);
        const completion = await requestWithTimeout(openai, model, messages, timeoutMs);
        const message = extractAssistantMessage(completion);

        return {
          message,
          modelUsed: model.name,
          modelId: model.id
        };
      } catch (error) {
        lastError = error;
        logger.warn(`${model.name} failed: ${describeFailure(error)}`);

        if (attempt < retriesPerModel) {
          logger.info(`Retrying model: ${model.name}`);
        }
      }
    }
  }

  const finalError = new Error("All SYNAPSE AI models failed.");
  finalError.cause = lastError;
  throw finalError;
}
