export const SYNAPSE_AI_BUSY_MESSAGE =
  "SYNAPSE AI is currently busy. Please try again shortly.";

export const AI_MODELS = [
  {
    name: "DeepSeek",
    id: "deepseek/deepseek-v4-flash:free"
  },
  {
    name: "Llama",
    id: "meta-llama/llama-3.3-70b-instruct:free"
  },
  {
    name: "Mistral",
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free"
  },
  {
    name: "Gemma",
    id: "google/gemma-4-26b-a4b-it:free"
  }
];

export const AI_ROUTER_CONFIG = {
  timeoutMs: 20_000,
  retriesPerModel: 1,
  maxMessages: 12,
  maxContentLength: 12_000,
  temperature: 0.35,
  maxTokens: 1_200,
  retryDelayMs: 750,
  maxRateLimitWaitMs: 2_500,
  defaultCooldownMs: 45_000,
  cooldownBufferMs: 1_250
};

const modelCooldowns = new Map();

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

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getHeader(headers, name) {
  if (!headers) return null;

  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function parseRetryAfterMs(value) {
  if (!value) return 0;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, numeric * 1000);
  }

  const dateValue = Date.parse(value);
  if (Number.isFinite(dateValue)) {
    return Math.max(0, dateValue - Date.now());
  }

  return 0;
}

function getOpenRouterErrorDetails(error) {
  const status = getErrorStatus(error);
  const metadata =
    error?.error?.metadata ||
    error?.response?.data?.error?.metadata ||
    error?.cause?.error?.metadata ||
    {};
  const headers = error?.headers || error?.response?.headers || error?.cause?.headers || null;
  const retryAfterMs =
    parseRetryAfterMs(getHeader(headers, "retry-after")) ||
    parseRetryAfterMs(metadata.retry_after_seconds || metadata.retry_after_seconds_raw);
  const message =
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    "Unknown AI provider error";

  return {
    name: error?.name || "OpenRouterError",
    status,
    code: error?.error?.code || error?.response?.data?.error?.code || null,
    message,
    provider: metadata.provider_name || null,
    raw: metadata.raw || null,
    retryAfterSeconds: retryAfterMs ? Math.ceil(retryAfterMs / 1000) : null,
    retryAfterMs,
    type: error?.type || error?.error?.type || null
  };
}

function describeFailure(error) {
  const details = getOpenRouterErrorDetails(error);
  return details.status ? `${details.status} ${details.message}` : details.message;
}

function getPromptCharCount(messages) {
  return messages.reduce((total, message) => total + String(message.content || "").length, 0);
}

function getCooldownRemainingMs(model) {
  const expiresAt = modelCooldowns.get(model.id) || 0;
  const remaining = expiresAt - Date.now();

  if (remaining <= 0) {
    modelCooldowns.delete(model.id);
    return 0;
  }

  return remaining;
}

function setModelCooldown(model, details, logger, requestId) {
  const retryAfterMs = details.retryAfterMs || 0;
  const cooldownMs =
    retryAfterMs > 0
      ? retryAfterMs + AI_ROUTER_CONFIG.cooldownBufferMs
      : AI_ROUTER_CONFIG.defaultCooldownMs;
  const expiresAt = Date.now() + cooldownMs;

  modelCooldowns.set(model.id, expiresAt);
  logger.warn(
    `[SYNAPSE AI ${requestId}] Cooldown set for ${model.name}: ${Math.ceil(cooldownMs / 1000)}s`
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetrySameModel(details, attempt, retriesPerModel) {
  if (attempt >= retriesPerModel) return false;

  if (details.status === 404 || details.status === 401 || details.status === 403) {
    return false;
  }

  if (details.status === 429) {
    return details.retryAfterMs > 0 && details.retryAfterMs <= AI_ROUTER_CONFIG.maxRateLimitWaitMs;
  }

  return !details.status || details.status >= 500 || details.status === 408;
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

async function requestWithTimeout(openai, model, messages, timeoutMs, logger, requestId, attempt) {
  const controller = new AbortController();
  let timeout = null;

  try {
    logger.info(
      `[SYNAPSE AI ${requestId}] Request -> ${model.name} (${model.id}) attempt ${attempt + 1}; messages=${messages.length}; chars=${getPromptCharCount(messages)}`
    );

    const apiPromise = openai.chat.completions.create(
      {
        model: model.id,
        messages,
        temperature: AI_ROUTER_CONFIG.temperature,
        max_tokens: AI_ROUTER_CONFIG.maxTokens
      },
      {
        signal: controller.signal
      }
    );
    const request =
      typeof apiPromise.withResponse === "function"
        ? apiPromise.withResponse()
        : apiPromise.then((data) => ({ data, response: null }));
    const completion = await Promise.race([
      request,
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
  const requestId = options.requestId || `local-${Date.now()}`;
  const failures = [];
  let lastError = null;

  logger.info(
    `[SYNAPSE AI ${requestId}] Router start. Models=${models
      .map((model) => `${model.name}:${model.id}`)
      .join(" -> ")}`
  );

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const cooldownRemainingMs = getCooldownRemainingMs(model);

    if (cooldownRemainingMs > 0) {
      logger.warn(
        `[SYNAPSE AI ${requestId}] Skipping ${model.name}; cooldown ${Math.ceil(
          cooldownRemainingMs / 1000
        )}s remaining.`
      );
      failures.push({
        model: model.name,
        modelId: model.id,
        reason: "cooldown",
        cooldownRemainingMs
      });
      continue;
    }

    if (modelIndex > 0) {
      logger.info(`[SYNAPSE AI ${requestId}] Switching to ${model.name}`);
    }

    for (let attempt = 0; attempt <= retriesPerModel; attempt += 1) {
      try {
        logger.info(`[SYNAPSE AI ${requestId}] Using model: ${model.name}`);
        const completion = await requestWithTimeout(
          openai,
          model,
          messages,
          timeoutMs,
          logger,
          requestId,
          attempt
        );
        const data = completion.data || completion;
        const message = extractAssistantMessage(data);

        logger.info(
          `[SYNAPSE AI ${requestId}] Response <- ${model.name}; status=${
            completion.response?.status || "parsed"
          }; returnedModel=${data?.model || model.id}; finish=${
            data?.choices?.[0]?.finish_reason || "unknown"
          }`
        );

        return {
          message,
          modelUsed: model.name,
          modelId: model.id
        };
      } catch (error) {
        lastError = error;
        const details = getOpenRouterErrorDetails(error);
        failures.push({
          model: model.name,
          modelId: model.id,
          attempt: attempt + 1,
          ...details
        });

        logger.warn(
          `[SYNAPSE AI ${requestId}] ${model.name} failed: ${describeFailure(error)}`
        );
        logger.warn(
          `[SYNAPSE AI ${requestId}] OpenRouter error detail: ${safeStringify({
            model: model.id,
            attempt: attempt + 1,
            ...details
          })}`
        );

        if (details.status === 429) {
          setModelCooldown(model, details, logger, requestId);
        }

        if (shouldRetrySameModel(details, attempt, retriesPerModel)) {
          const delayMs =
            details.status === 429 && details.retryAfterMs
              ? Math.min(details.retryAfterMs, AI_ROUTER_CONFIG.maxRateLimitWaitMs)
              : AI_ROUTER_CONFIG.retryDelayMs;

          logger.info(
            `[SYNAPSE AI ${requestId}] Retrying ${model.name} after ${delayMs}ms`
          );
          await sleep(delayMs);
          continue;
        }

        break;
      }
    }
  }

  logger.error(
    `[SYNAPSE AI ${requestId}] All model attempts failed. Emergency fallback engaged. Last failure: ${safeStringify(
      getOpenRouterErrorDetails(lastError)
    )}`
  );

  return {
    message: SYNAPSE_AI_BUSY_MESSAGE,
    modelUsed: "Emergency Fallback",
    modelId: "emergency-fallback",
    emergency: true,
    failures
  };
}
