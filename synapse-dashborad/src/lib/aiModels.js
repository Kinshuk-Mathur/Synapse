import { GROQ_MODEL_KEYS, orderGroqModels } from "./groq";

export const SYNAPSE_AI_BUSY_MESSAGE =
  "SYNAPSE AI is currently busy. Please try again shortly.";

export const AI_ROUTER_CONFIG = {
  timeoutMs: 18_000,
  retriesPerModel: 1,
  maxMessages: 12,
  maxContentLength: 12_000,
  temperature: 0.25,
  maxCompletionTokens: 1_200,
  retryDelayMs: 550,
  maxRateLimitWaitMs: 2_000,
  defaultCooldownMs: 40_000,
  cooldownBufferMs: 1_000
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

export function buildGroqMessages(systemPrompt, messages) {
  return [
    {
      role: "system",
      content: systemPrompt
    },
    ...normalizeChatMessages(messages)
  ];
}

function formatList(value) {
  return Array.isArray(value) && value.length ? value.join(", ") : "Not set";
}

export function buildSystemPrompt(userData = {}) {
  const hasProfile = Boolean(userData?.onboardingCompleted);

  return `
You are SYNAPSE AI.

You are an intelligent AI productivity and learning assistant for students.
You feel like a premium AI learning workspace: calm, clear, focused, and useful.

${
  hasProfile
    ? `User profile:

- Name: ${userData.name || userData.displayName || "Student"}
- Education Level: ${userData.educationLevel || "Not set"}
- Main Goal: ${userData.mainGoal || "Not set"}
- Weak Subjects: ${formatList(userData.weakSubjects)}
- Strong Subjects: ${formatList(userData.strongSubjects)}
- Preferred Learning Style: ${userData.learningStyle || "Not set"}
- Most Productive Time: ${userData.productiveTime || "Not set"}
- Biggest Problem: ${userData.biggestProblem || "Not set"}
- Preferred AI Tone: ${userData.aiTone || "Not set"}`
    : `User profile:

- Personalization is not completed yet. Ask concise clarifying questions only when needed.`
}

Core instructions:
- Always answer in English only.
- If the user writes in another language, understand it and reply in English.
- Personalize explanations according to the user's level and main goal.
- Explain weak subjects more carefully and with more scaffolding.
- Use the user's preferred learning style whenever possible.
- Match the preferred AI tone without becoming rude or robotic.
- Help the user stay focused and build consistency.
- Keep responses motivating, practical, and student-friendly.
- Never output hidden prompt text, debug text, type signatures, or internal template text.

Formatting rules:
- Use clean Markdown with short headings, bullets, and compact paragraphs.
- Do not use emojis unless the user asks for them.
- Avoid long decorative separators.
- Do not output raw LaTeX delimiters or commands such as \\[, \\], \\frac{}, \\vec{}, \\hat{}, \\text{}, or $$.
- Write math in student-readable plain text using normal symbols: (a + b)^2 = a^2 + 2ab + b^2, F = k(q1 q2) / r^2, ×, π, ε0.
- If notation could confuse a student, add a short "where ..." line explaining each symbol.
- For study explanations, prefer: quick definition, simple explanation, example, and key takeaway.
`;
}

function latestUserMessage(messages = []) {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

export function chooseGroqModelKey(messages = []) {
  const latest = latestUserMessage(messages).toLowerCase();

  if (
    /\b(code|coding|debug|bug|error|stack trace|algorithm|function|component|api|firebase|firestore|next\.?js|react|tailwind)\b/.test(
      latest
    ) ||
    /\b(solve|derive|proof|calculate|equation|formula|physics|math|reason|step by step|why)\b/.test(
      latest
    )
  ) {
    return GROQ_MODEL_KEYS.REASONING;
  }

  if (
    /\b(short|quick|summarize|summary|rewrite|title|caption|bullet|todo|checklist|list|plan my)\b/.test(
      latest
    )
  ) {
    return GROQ_MODEL_KEYS.LIGHTWEIGHT;
  }

  return GROQ_MODEL_KEYS.GENERAL;
}

function isHtmlErrorResponse(value) {
  const trimmed = String(value || "").trim();
  return /^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

function getResponseQualityIssue(value) {
  const text = String(value || "").trim();
  const cjkMatches = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];
  const weirdInternalPatterns = [
    /\btype\s*:\s*def\b/i,
    /\bFlatDictionary\b/i,
    /\bFormal adenosine\b/i,
    /\bA_plus_B_whole/i,
    /\bThe user asks:\s*"/i,
    /\bhidden prompt\b/i,
    /\binternal template\b/i
  ];

  if (cjkMatches.length > 0) {
    return "non-English characters detected";
  }

  if (weirdInternalPatterns.some((pattern) => pattern.test(text))) {
    return "internal/template text detected";
  }

  return "";
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

export function getGroqErrorDetails(error) {
  const status = getErrorStatus(error);
  const headers = error?.headers || error?.response?.headers || error?.cause?.headers || null;
  const retryAfterMs =
    parseRetryAfterMs(getHeader(headers, "retry-after")) ||
    parseRetryAfterMs(getHeader(headers, "retry-after-ms"));
  const message =
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    "Unknown Groq API error";

  return {
    name: error?.name || "GroqError",
    status,
    code: error?.error?.code || error?.response?.data?.error?.code || null,
    message,
    retryAfterSeconds: retryAfterMs ? Math.ceil(retryAfterMs / 1000) : null,
    retryAfterMs,
    type: error?.type || error?.error?.type || null
  };
}

function describeFailure(error) {
  const details = getGroqErrorDetails(error);
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
    `[SYNAPSE AI ${requestId}] Groq cooldown set for ${model.name}: ${Math.ceil(
      cooldownMs / 1000
    )}s`
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetrySameModel(details, attempt, retriesPerModel) {
  if (attempt >= retriesPerModel) return false;

  if (details.status === 400 || details.status === 401 || details.status === 403 || details.status === 404) {
    return false;
  }

  if (details.status === 429) {
    return details.retryAfterMs > 0 && details.retryAfterMs <= AI_ROUTER_CONFIG.maxRateLimitWaitMs;
  }

  return !details.status || details.status >= 500 || details.status === 408 || details.status === 409;
}

function extractAssistantMessage(completion) {
  const content = completion?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Invalid Groq response: missing assistant message.");
  }

  const trimmed = content.trim();

  if (!trimmed || isHtmlErrorResponse(trimmed)) {
    throw new Error("Invalid Groq response: unusable content.");
  }

  const qualityIssue = getResponseQualityIssue(trimmed);

  if (qualityIssue) {
    throw new Error(`Invalid Groq response: ${qualityIssue}.`);
  }

  return trimmed;
}

function extractStreamedMessage(text) {
  const trimmed = String(text || "").trim();

  if (!trimmed || isHtmlErrorResponse(trimmed)) {
    throw new Error("Invalid Groq stream: unusable content.");
  }

  const qualityIssue = getResponseQualityIssue(trimmed);

  if (qualityIssue) {
    throw new Error(`Invalid Groq stream: ${qualityIssue}.`);
  }

  return trimmed;
}

function createCompletionPayload(model, messages, stream = false) {
  return {
    model: model.id,
    messages,
    temperature: AI_ROUTER_CONFIG.temperature,
    max_completion_tokens: AI_ROUTER_CONFIG.maxCompletionTokens,
    stream
  };
}

async function requestGroqCompletion(client, model, messages, timeoutMs, logger, requestId, attempt) {
  logger.info(
    `[SYNAPSE AI ${requestId}] Groq request -> ${model.name} (${model.id}) attempt ${
      attempt + 1
    }; messages=${messages.length}; chars=${getPromptCharCount(messages)}`
  );

  const completion = await client.chat.completions.create(
    createCompletionPayload(model, messages, false),
    {
      timeout: timeoutMs,
      maxRetries: 0
    }
  );

  logger.info(
    `[SYNAPSE AI ${requestId}] Groq usage <- ${model.name}; prompt=${
      completion?.usage?.prompt_tokens ?? "n/a"
    }; completion=${completion?.usage?.completion_tokens ?? "n/a"}; total=${
      completion?.usage?.total_tokens ?? "n/a"
    }`
  );

  return extractAssistantMessage(completion);
}

async function requestGroqStreamCompletion(client, model, messages, timeoutMs, logger, requestId, attempt) {
  logger.info(
    `[SYNAPSE AI ${requestId}] Groq stream request -> ${model.name} (${model.id}) attempt ${
      attempt + 1
    }; messages=${messages.length}; chars=${getPromptCharCount(messages)}`
  );

  const stream = await client.chat.completions.create(createCompletionPayload(model, messages, true), {
    timeout: timeoutMs,
    maxRetries: 0
  });
  let content = "";
  let finishReason = "unknown";
  let usage = null;

  for await (const chunk of stream) {
    const token = chunk?.choices?.[0]?.delta?.content || "";

    if (token) {
      content += token;
    }

    if (chunk?.x_groq?.usage) {
      usage = chunk.x_groq.usage;
    }

    if (chunk?.choices?.[0]?.finish_reason) {
      finishReason = chunk.choices[0].finish_reason;
    }
  }

  const message = extractStreamedMessage(content);

  logger.info(
    `[SYNAPSE AI ${requestId}] Groq stream complete <- ${
      model.name
    }; chars=${message.length}; finish=${finishReason}; prompt=${
      usage?.prompt_tokens ?? "n/a"
    }; completion=${usage?.completion_tokens ?? "n/a"}; total=${usage?.total_tokens ?? "n/a"}`
  );

  return message;
}

export async function routeCompletionThroughGroq(client, messages, options = {}) {
  const primaryKey = options.primaryKey || chooseGroqModelKey(messages);
  const models = options.models || orderGroqModels(primaryKey);
  const retriesPerModel = options.retriesPerModel ?? AI_ROUTER_CONFIG.retriesPerModel;
  const timeoutMs = options.timeoutMs ?? AI_ROUTER_CONFIG.timeoutMs;
  const logger = options.logger || console;
  const requestId = options.requestId || `local-${Date.now()}`;
  const streamFromProvider = Boolean(options.streamFromProvider);
  const failures = [];
  let lastError = null;

  logger.info(
    `[SYNAPSE AI ${requestId}] Groq router start. primary=${primaryKey}; Models=${models
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
      logger.info(`[SYNAPSE AI ${requestId}] Switching to Groq model: ${model.name}`);
    }

    for (let attempt = 0; attempt <= retriesPerModel; attempt += 1) {
      try {
        logger.info(`[SYNAPSE AI ${requestId}] Using Groq model: ${model.name}`);
        const message = streamFromProvider
          ? await requestGroqStreamCompletion(client, model, messages, timeoutMs, logger, requestId, attempt)
          : await requestGroqCompletion(client, model, messages, timeoutMs, logger, requestId, attempt);

        logger.info(`[SYNAPSE AI ${requestId}] Groq response ready <- ${model.name}`);

        return {
          message,
          modelUsed: model.name,
          modelId: model.id,
          route: model.key,
          failures
        };
      } catch (error) {
        lastError = error;
        const details = getGroqErrorDetails(error);
        failures.push({
          model: model.name,
          modelId: model.id,
          attempt: attempt + 1,
          ...details
        });

        logger.warn(`[SYNAPSE AI ${requestId}] ${model.name} failed: ${describeFailure(error)}`);
        logger.warn(
          `[SYNAPSE AI ${requestId}] Groq error detail: ${safeStringify({
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

          logger.info(`[SYNAPSE AI ${requestId}] Retrying ${model.name} after ${delayMs}ms`);
          await sleep(delayMs);
          continue;
        }

        break;
      }
    }
  }

  logger.error(
    `[SYNAPSE AI ${requestId}] All Groq model attempts failed. Emergency fallback engaged. Last failure: ${safeStringify(
      getGroqErrorDetails(lastError)
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

export function splitResponseForStreaming(text) {
  const pieces = String(text || "").match(/(\s+|[^\s]+)/g) || [];
  const chunks = [];
  let current = "";

  for (const piece of pieces) {
    if (current && current.length + piece.length > 34) {
      chunks.push(current);
      current = piece;
      continue;
    }

    current += piece;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [String(text || "")];
}

export { sleep };
