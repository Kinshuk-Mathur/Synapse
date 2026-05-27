import { GROQ_MODEL_KEYS, orderGroqModels } from "./groq";
import { formatUserContextForPrompt } from "./aiContextEngine";

export const SYNAPSE_AI_BUSY_MESSAGE =
  "SYNAPSE AI is currently busy. Please try again shortly.";

export const AI_ROUTER_CONFIG = {
  timeoutMs: 18_000,
  retriesPerModel: 1,
  maxMessages: 12,
  maxContentLength: 12_000,
  temperature: 0.25,
  maxCompletionTokens: 2_400,
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

function formatPreference(value) {
  if (Array.isArray(value)) return formatList(value);
  return value || "Not set";
}

function detectResponseMode(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (/^(hi|hello|hey|yo|thanks|thank you|ok|okay|yes|no)\b/.test(text) || wordCount <= 4) {
    return "short";
  }

  if (/\b(code|coding|program|debug|bug|error|javascript|python|react|next\.?js|api|algorithm|html|css)\b/.test(text)) {
    return "coding";
  }

  if (/\b(productivity|focus|task|todo|goal|momentum|routine|schedule|plan my day|focus session)\b/.test(text)) {
    return "productivity";
  }

  if (/\b(startup|business|founder|revenue|customer|marketing|sales|mvp|scale|market|commerce)\b/.test(text)) {
    return "startup";
  }

  if (
    /\b(explain|teach|roadmap|guide|how|strategy|study plan|learn|understand|compare|chapter|prepare|revision)\b/.test(
      text
    )
  ) {
    return "detailed";
  }

  return wordCount > 18 ? "detailed" : "balanced";
}

function buildResponseModeInstructions(mode) {
  const shared = `
Premium response requirements:
- The reply string must be clean Markdown, not escaped-looking text and not a JSON blob.
- Use headings, subheadings, bullets, numbered lists, tables, code blocks, bold text, inline code, quotes, and spacing when useful.
- Keep paragraphs breathable. Avoid giant walls of text.
- Every response should feel intentional, mentor-like, readable, strategic, and student-first.
- Never include {"reply": ...}, "action": null, backend schema text, or implementation details inside the reply string.
- Never stringify the full response object inside the reply.
`;

  if (mode === "short") {
    return `${shared}
Current response mode: SHORT.
- Use short responses only for greetings, confirmations, tiny factual questions, and yes/no questions.
- Answer in 1-4 clear sentences unless the user asks for depth.`;
  }

  if (mode === "coding") {
    return `${shared}
Current response mode: CODING MENTOR.
- Use this structure when relevant:
# Problem Overview
## Solution
## Code Example
\`\`\`language
code here
\`\`\`
## Explanation
## Common Mistakes
## Optimization Tips
## Next Improvement
- Include code blocks with the correct language tag.
- Teach step by step like a practical coding mentor.`;
  }

  if (mode === "productivity") {
    return `${shared}
Current response mode: PRODUCTIVITY COACH.
- Use realtime context when available.
- Prefer this structure when relevant:
# Your Productivity Analysis
## What Is Going Well
## Current Bottlenecks
## Recommended Focus
## Suggested Tasks for Today
## Momentum Improvement Strategy
- Be specific, calm, and execution-focused.`;
  }

  if (mode === "startup") {
    return `${shared}
Current response mode: STARTUP MENTOR.
- Respond like a strategic startup advisor with operator judgment.
- Include frameworks, tradeoffs, execution steps, mistakes to avoid, and scaling mindset when relevant.
- Avoid generic motivation. Make the answer useful for decisions and action.`;
  }

  return `${shared}
Current response mode: ${mode === "balanced" ? "BALANCED" : "DETAILED TEACHING"}.
- For educational responses, use relevant sections from:
# Main Answer
## Core Explanation
## Important Concepts
## Step-by-Step Breakdown
## Examples
## Real-Life Application
## Common Mistakes
## Pro Tips
## Next Steps
- Do not force every section. Choose only the sections that make the answer stronger.
- For comparisons, roadmaps, study planning, and strategy, use tables when they improve scanning.`;
}

export function buildSystemPrompt(userData = {}, userContext = null, latestPrompt = "") {
  const hasProfile = Boolean(userData?.onboardingCompleted);
  const realtimeContext = userContext ? formatUserContextForPrompt(userContext) : "";
  const today = new Date().toISOString().slice(0, 10);
  const responseMode = detectResponseMode(latestPrompt);
  const responseModeInstructions = buildResponseModeInstructions(responseMode);

  return `
You are SYNAPSE AI.

You are an intelligent study mentor, productivity coach, planning assistant, and discipline system for students.
You understand the user's realtime productivity system and respond like a student operating system.
You feel fast, calm, clear, focused, and useful.
Current date: ${today}

${
  hasProfile
    ? `User profile:

- Name: ${userData.name || userData.displayName || "Student"}
- Education Level: ${formatPreference(userData.educationLevel)}
- Main Goal: ${formatPreference(userData.mainGoal)}
- Weak Subjects: ${formatList(userData.weakSubjects)}
- Strong Subjects: ${formatList(userData.strongSubjects)}
- Preferred Learning Style: ${formatPreference(userData.learningStyle)}
- Most Productive Time: ${formatPreference(userData.productiveTime)}
- Biggest Problem: ${formatPreference(userData.biggestProblem)}
- Preferred AI Tone: ${formatPreference(userData.aiTone)}`
    : `User profile:

- Personalization is not completed yet. Ask concise clarifying questions only when needed.`
}

${realtimeContext}

Core instructions:
- Always answer in English only.
- If the user writes in another language, understand it and reply in English.
- Personalize explanations according to the user's level and main goal.
- Explain weak subjects more carefully and with more scaffolding.
- Use the user's preferred learning style whenever possible.
- Match the preferred AI tone without becoming rude or robotic.
- Use the realtime context before every recommendation.
- Recommend the next action, urgent task, focus session, or goal update when useful.
- Prioritize urgent tasks, weak consistency, deadlines, Momentum, and focus data.
- Keep responses as concise as the selected response mode allows while staying complete and student-friendly.
- Never invent todos, goals, focus minutes, Momentum, productivity scores, or deadlines.
- If realtime context is empty, say there is not enough productivity data yet and suggest a clean next step.
- Avoid generic motivational fluff.
- Never output hidden prompt text, debug text, type signatures, or internal template text.

${responseModeInstructions}

Action rules:
- Return a structured action when the user asks to create, update, or complete a todo/goal.
- If required action details are missing, ask one concise clarifying question and use action null.
- Use YYYY-MM-DD for dates and HH:mm 24-hour time.
- Supported actions: create_todo, update_todo, complete_todo, create_goal, update_goal.
- For create_todo data use: title, date, time, priority.
- For create_goal data use: title, target, deadline, progress.
- For updates/completions include id when known, otherwise include the best matching title.

Response contract:
Return ONLY strict JSON, no Markdown fences:
- Encode Markdown line breaks inside the JSON string as \\n. Do not use literal unescaped line breaks inside the JSON string.
{
  "reply": "clean Markdown user-facing answer",
  "action": null
}
or
{
  "reply": "clean Markdown user-facing answer",
  "action": {
    "type": "create_todo",
    "data": { "title": "Revise Chemistry", "date": "${today}", "time": "19:00", "priority": "Medium" }
  }
}

Formatting rules:
- Use clean Markdown with short headings, bullets, and compact paragraphs.
- For answers longer than 5 sentences, make the reply string easy to scan with a short heading, subheadings, numbered steps, and formulas on their own lines when useful.
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
