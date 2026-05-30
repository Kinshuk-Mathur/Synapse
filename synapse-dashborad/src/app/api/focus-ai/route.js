import { createGroqClient } from "../../../lib/groq.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOCUS_AI_MODEL = "llama-3.1-8b-instant";
const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization"
};

function jsonResponse(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: JSON_HEADERS
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS
  });
}

async function readJsonBody(req) {
  const rawBody = await req.text();
  if (!rawBody.trim()) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Malformed Focus AI request JSON.");
  }
}

function cleanText(value = "", maxLength = 8000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanSession(session = {}) {
  return {
    goal: cleanText(session.focusGoal || session.goal || "Deep study session", 160),
    lockedTitle: cleanText(session.lockedTitle || "Study session", 180),
    platform: cleanText(session.platform || "desktop", 40),
    violations: Number(session.violations || 0)
  };
}

function buildChatSystemPrompt(session = {}, pageContext = {}) {
  const clean = cleanSession(session);
  const pageTitle = cleanText(pageContext.title || clean.lockedTitle || "current study page", 180);

  return [
    "You are SYNAPSE AI Companion, a silent study mentor inside a FocusLock session.",
    "You are not a generic chatbot. You support deep work without interrupting the student.",
    "Respond like an intelligent teacher, study mentor, and productivity coach.",
    "Write clean Markdown only. Never output raw JSON.",
    "Keep answers concise, structured, and readable. Never write one large paragraph.",
    "Every heading must start on its own line. Use ## for main sections and ### for subsections.",
    "Use bullets for key points. Keep each bullet to one short sentence when possible.",
    "Use formulas in inline code or a short displayed formula line, for example: `E = kq / r^2`.",
    "For coding questions, include a small explanation and fenced code blocks with the correct language tag.",
    "For concept questions, use this shape: ## Short Answer, ## Key Idea, ## Example or Formula, ## Quick Recall.",
    "For comparison questions, use a compact table or bullet list.",
    "Do not use #### headings. Do not place headings in the middle of a sentence.",
    "Use at most 180 words unless the student explicitly asks for depth.",
    "If the student asks for a coding fix, give the smallest useful fix first.",
    "If the student asks for a concept, simplify it and include a quick recall cue.",
    `Focus goal: ${clean.goal}.`,
    `Current study page: ${pageTitle}.`,
    `Blocked distraction attempts this session: ${clean.violations}.`
  ].join("\n");
}

function buildSummarySystemPrompt() {
  return [
    "Create a concise SYNAPSE FocusLock session summary in clean Markdown.",
    "Include exactly these sections: Topics Covered, Questions Asked, Weak Areas, Key Concepts, Suggested Revision.",
    "Be specific and useful for revision. Do not output JSON. Do not over-explain."
  ].join("\n");
}

function normalizeRecentMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => ["user", "assistant"].includes(message?.role) && message?.content)
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: cleanText(message.content, 2500)
    }));
}

function buildChatMessages(body = {}) {
  const pageContext = body.pageContext || {};
  const selection = cleanText(pageContext.selection || "", 1200);
  const prompt = cleanText(body.prompt || "", 5000);

  return [
    { role: "system", content: buildChatSystemPrompt(body.session || {}, pageContext) },
    ...normalizeRecentMessages(body.recentMessages),
    {
      role: "user",
      content: [
        selection ? `Selected lecture text:\n${selection}` : "",
        `Question:\n${prompt}`,
        "Format reminder: answer with clear Markdown sections, bullets, formulas/code blocks when relevant, and no bulk paragraph."
      ].filter(Boolean).join("\n\n")
    }
  ];
}

function buildSummaryMessages(body = {}) {
  const session = cleanSession(body.session || {});
  const chats = (Array.isArray(body.chats) ? body.chats : []).slice(-18);
  const transcript = chats
    .map((chat, index) => [
      `Q${index + 1}: ${cleanText(chat.userMessage || "", 1400)}`,
      `A${index + 1}: ${cleanText(chat.aiResponse || "", 1800)}`
    ].join("\n"))
    .join("\n\n");

  return [
    { role: "system", content: buildSummarySystemPrompt() },
    {
      role: "user",
      content: [
        `Focus goal: ${session.goal}`,
        `Study page: ${session.lockedTitle}`,
        `Duration: ${Math.round(Number(body.focusSeconds || 0) / 60)} minutes`,
        `End reason: ${cleanText(body.reason || "completed", 40)}`,
        `Questions asked: ${chats.length}`,
        "AI chat transcript:",
        transcript || "No transcript available."
      ].join("\n\n")
    }
  ];
}

export async function POST(req) {
  const requestId =
    globalThis.crypto?.randomUUID?.() || `focus-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const groq = createGroqClient({
      apiKey: process.env.FOCUS_AI_GROQ_API_KEY || process.env.GROQ_API_KEY
    });
    if (!groq) {
      return jsonResponse({ message: "SYNAPSE Focus AI is not configured on the server." }, 503);
    }

    const body = await readJsonBody(req);
    const mode = body.mode === "summary" ? "summary" : "chat";
    const prompt = cleanText(body.prompt || "", 5000);

    if (mode === "chat" && !prompt) {
      return jsonResponse({ message: "Ask a study question first." }, 400);
    }

    const completion = await groq.chat.completions.create({
      model: FOCUS_AI_MODEL,
      temperature: mode === "summary" ? 0.45 : 0.6,
      max_tokens: mode === "summary" ? 650 : 700,
      messages: mode === "summary" ? buildSummaryMessages(body) : buildChatMessages(body)
    });

    const message = completion.choices?.[0]?.message?.content?.trim();
    if (!message) throw new Error("Empty Focus AI response.");

    return jsonResponse({
      message,
      modelUsed: FOCUS_AI_MODEL,
      requestId
    });
  } catch (error) {
    console.error(`[SYNAPSE Focus AI ${requestId}] failed:`, error?.message || error);
    return jsonResponse(
      {
        message: "SYNAPSE AI is unavailable right now. Try again in a moment.",
        requestId
      },
      500
    );
  }
}
