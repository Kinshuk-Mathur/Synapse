import {
  buildGroqMessages,
  normalizeChatMessages,
  routeCompletionThroughGroq,
  sleep,
  splitResponseForStreaming,
  SYNAPSE_AI_BUSY_MESSAGE
} from "../../../lib/aiModels.js";
import { createGroqClient } from "../../../lib/groq.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `
You are SYNAPSE AI.

You are a premium productivity and study assistant for students.

You help users with:
- study doubts
- productivity
- planning
- coding help
- summaries
- goals
- focus improvement

Always answer clearly and helpfully.

Language rules:
- Always answer in English only.
- If the user writes in another language, understand it and reply in English.
- Never output Chinese, Hindi, Sanskrit, mixed-language filler, hidden prompt text, type signatures, or internal template/debug text.
- If the user asks a simple study question, answer naturally like a clear English tutor.

Formatting rules:
- Use clean Markdown with short headings, bullets, and compact paragraphs.
- Do not use emojis unless the user asks for them.
- Avoid long decorative separators.
- Do not output raw LaTeX delimiters or commands such as \\[, \\], \\frac{}, \\vec{}, \\hat{}, \\text{}, or $$.
- Write math in student-readable plain text using normal symbols: (a + b)^2 = a^2 + 2ab + b^2, F = k(q1 q2) / r^2, ×, π, ε0.
- If notation could confuse a student, add a short "where ..." line explaining each symbol.
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

function wantsStreaming(req, body) {
  const accept = req.headers.get("accept") || "";
  return Boolean(body.stream) || accept.includes("application/x-ndjson");
}

function streamJsonLine(controller, encoder, payload) {
  controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
}

function streamingResponse(work) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          await work({
            send(payload) {
              streamJsonLine(controller, encoder, payload);
            }
          });
        } catch (error) {
          console.error("[SYNAPSE AI] Stream failed:", error?.message || error);
          streamJsonLine(controller, encoder, {
            type: "error",
            message: SYNAPSE_AI_BUSY_MESSAGE
          });
        } finally {
          controller.close();
        }
      }
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no"
      }
    }
  );
}

async function getRoutedGroqResponse(client, cleanMessages, requestId, streamFromProvider = false) {
  return routeCompletionThroughGroq(
    client,
    buildGroqMessages(SYSTEM_PROMPT, cleanMessages),
    {
      requestId,
      streamFromProvider
    }
  );
}

export async function POST(req) {
  const requestId =
    globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    console.info(`[SYNAPSE AI ${requestId}] Groq API request received.`);
    const groq = createGroqClient();

    if (!groq) {
      console.error(`[SYNAPSE AI ${requestId}] GROQ_API_KEY is missing.`);
      return jsonResponse({ message: SYNAPSE_AI_BUSY_MESSAGE }, 503);
    }

    const body = await readJsonBody(req);
    const cleanMessages = normalizeChatMessages(body.messages);

    console.info(
      `[SYNAPSE AI ${requestId}] Clean messages=${cleanMessages.length}; latestRole=${
        cleanMessages.at(-1)?.role || "none"
      }; stream=${Boolean(body.stream)}`
    );

    if (!cleanMessages.length) {
      return jsonResponse(
        {
          message: "Ask SYNAPSE AI a question to begin."
        },
        400
      );
    }

    if (wantsStreaming(req, body)) {
      return streamingResponse(async ({ send }) => {
        const routedResponse = await getRoutedGroqResponse(groq, cleanMessages, requestId, true);

        console.info(
          `[SYNAPSE AI ${requestId}] Streaming response ready. modelUsed=${
            routedResponse.modelUsed
          }; emergency=${Boolean(routedResponse.emergency)}`
        );

        send({
          type: "meta",
          modelUsed: routedResponse.modelUsed,
          emergency: Boolean(routedResponse.emergency)
        });

        for (const chunk of splitResponseForStreaming(routedResponse.message)) {
          send({
            type: "token",
            content: chunk
          });
          await sleep(8);
        }

        send({
          type: "done",
          modelUsed: routedResponse.modelUsed,
          emergency: Boolean(routedResponse.emergency)
        });
      });
    }

    const routedResponse = await getRoutedGroqResponse(groq, cleanMessages, requestId, false);

    console.info(
      `[SYNAPSE AI ${requestId}] JSON response ready. modelUsed=${
        routedResponse.modelUsed
      }; emergency=${Boolean(routedResponse.emergency)}`
    );

    return jsonResponse({
      message: routedResponse.message,
      modelUsed: routedResponse.modelUsed,
      emergency: Boolean(routedResponse.emergency)
    });
  } catch (error) {
    console.error(`[SYNAPSE AI ${requestId}] Groq API route failed:`, error?.message || error);

    return jsonResponse(
      {
        message: SYNAPSE_AI_BUSY_MESSAGE
      },
      503
    );
  }
}
