import OpenAI from "openai";
import {
  buildOpenRouterMessages,
  normalizeChatMessages,
  routeCompletionThroughModels,
  SYNAPSE_AI_BUSY_MESSAGE
} from "../../../lib/aiModels.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const SYSTEM_PROMPT = `
You are SYNAPSE AI.

You are a futuristic productivity and study assistant for students.

You help users with:
- study doubts
- productivity
- planning
- coding help
- summaries
- goals
- focus improvement

Always answer clearly and helpfully.

Formatting rules:
- Use clean Markdown with short headings, bullets, and compact paragraphs.
- Do not use emojis unless the user asks for them.
- Avoid long decorative separators.
- For study explanations, use: quick definition, simple explanation, example, and key takeaway.
`;

function jsonResponse(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function createOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-Title": "SYNAPSE AI"
    }
  });
}

async function readJsonBody(req) {
  const rawBody = await req.text();

  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Malformed chat request JSON.");
  }
}

export async function POST(req) {
  try {
    const openai = createOpenRouterClient();

    if (!openai) {
      console.error("SYNAPSE AI backend: OPENROUTER_API_KEY is missing.");
      return jsonResponse({ message: SYNAPSE_AI_BUSY_MESSAGE }, 503);
    }

    const body = await readJsonBody(req);
    const cleanMessages = normalizeChatMessages(body.messages);

    if (!cleanMessages.length) {
      return jsonResponse(
        {
          message: "Ask SYNAPSE AI a question to begin."
        },
        400
      );
    }

    const routedResponse = await routeCompletionThroughModels(
      openai,
      buildOpenRouterMessages(SYSTEM_PROMPT, cleanMessages)
    );

    return jsonResponse({
      message: routedResponse.message,
      modelUsed: routedResponse.modelUsed
    });
  } catch (error) {
    console.error("SYNAPSE AI routing failed:", error?.message || error);

    return jsonResponse(
      {
        message: SYNAPSE_AI_BUSY_MESSAGE
      },
      503
    );
  }
}
