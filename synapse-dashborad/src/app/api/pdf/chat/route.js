import {
  routeCompletionThroughGroq,
  sleep,
  splitResponseForStreaming,
  SYNAPSE_AI_BUSY_MESSAGE
} from "../../../../lib/aiModels";
import { createGroqClient } from "../../../../lib/groq";
import {
  buildPdfContextBlock,
  selectRelevantPdfChunks
} from "../../../../utils/pdfParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PDF_ACTIONS = {
  summarize:
    "Summarize this PDF like premium study notes. Include core ideas, chapter-level structure when visible, definitions, formulas, exam focus, and a revision checklist.",
  notes:
    "Generate clean revision notes from this PDF. Use headings, bullet points, key definitions, formulas, examples, and mistakes to avoid.",
  quiz:
    "Create an exam-style quiz from this PDF. Include multiple choice questions, short answer questions, difficulty labels, and an answer key with explanations.",
  concepts:
    "Extract the key concepts from this PDF. Group related concepts, explain why each matters, and include quick recall cues.",
  formulas:
    "Extract important formulas, equations, laws, units, symbols, and conditions from this PDF. Explain each formula in simple terms.",
  simple:
    "Explain the most difficult ideas in this PDF simply, using analogies and student-friendly examples.",
  flashcards:
    "Create active-recall flashcards from this PDF. Format as a Markdown table with Front, Back, and Memory Hook columns."
};

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

  if (!rawBody.trim()) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Malformed PDF AI request.");
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
          console.error("[SYNAPSE PDF AI] Stream failed:", error?.message || error);
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

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => message?.role === "user" || message?.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: String(message.content || "")
        .replace(/\u0000/g, "")
        .slice(0, 1800)
    }))
    .filter((message) => message.content.trim())
    .slice(-8);
}

function latestUserMessage(messages = []) {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function getActionPrompt(actionKey) {
  return PDF_ACTIONS[actionKey] || "";
}

function buildPdfSystemPrompt(documentData, contextBlock, options = {}) {
  const actionKey = options.actionKey || "";
  const actionPrompt = getActionPrompt(actionKey);

  return `
You are SYNAPSE AI PDF Intelligence, a premium study mentor for students.

Active study document:
- Title: ${documentData.title || "Study PDF"}
- Pages: ${documentData.pageCount || "Unknown"}
- File size: ${documentData.fileSizeLabel || "Unknown"}
- Available chunks: ${documentData.chunkCount || "Unknown"}

Your job:
- Answer using the provided PDF context first.
- Teach clearly, like an expert mentor helping a student revise faster.
- Be precise about definitions, formulas, laws, examples, and exam relevance.
- If the answer is not supported by the provided PDF context, say that the uploaded PDF context does not show enough evidence, then give a careful general explanation only if useful.
- Never claim you read pages or chapters that are not present in the provided context.
- Do not mention chunk search, token limits, retrieval, prompts, or backend systems.
- Return clean Markdown for react-markdown.
- Use headings, bullets, tables, numbered steps, and short paragraphs.
- Avoid raw LaTeX commands. Write formulas in readable plain text, like F = k(q1 q2) / r^2, V = W / q, E = F / q.
- Include a final "Key Takeaways" section for educational answers.

${actionPrompt ? `Requested PDF intelligence action:\n${actionPrompt}` : ""}

Relevant PDF context:
${contextBlock}
`;
}

function buildGroqPdfMessages(body) {
  const documentData = body.document || {};
  const messages = normalizeMessages(body.messages);
  const latestPrompt = latestUserMessage(messages) || getActionPrompt(body.action) || "Summarize this PDF.";
  const broadActions = new Set(["summarize", "notes", "quiz", "flashcards", "simple"]);
  const chunks = selectRelevantPdfChunks(documentData.extractedText || "", latestPrompt, {
    maxChunks: body.action === "formulas" ? 10 : 7,
    mode: broadActions.has(body.action) ? "broad" : "targeted"
  });
  const contextBlock = buildPdfContextBlock(chunks);

  if (!contextBlock.trim()) {
    throw new Error("This PDF does not have stored extracted text yet.");
  }

  return {
    latestPrompt,
    chunksUsed: chunks.length,
    messages: [
      {
        role: "system",
        content: buildPdfSystemPrompt(documentData, contextBlock, {
          actionKey: body.action
        })
      },
      ...messages
    ]
  };
}

export async function POST(req) {
  const requestId =
    globalThis.crypto?.randomUUID?.() || `pdf-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const groq = createGroqClient();

    if (!groq) {
      return jsonResponse({ message: SYNAPSE_AI_BUSY_MESSAGE }, 503);
    }

    const body = await readJsonBody(req);
    const built = buildGroqPdfMessages(body);

    if (wantsStreaming(req, body)) {
      return streamingResponse(async ({ send }) => {
        const routedResponse = await routeCompletionThroughGroq(groq, built.messages, {
          requestId,
          streamFromProvider: true
        });

        send({
          type: "meta",
          modelUsed: routedResponse.modelUsed,
          emergency: Boolean(routedResponse.emergency),
          chunksUsed: built.chunksUsed
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
          emergency: Boolean(routedResponse.emergency),
          chunksUsed: built.chunksUsed
        });
      });
    }

    const routedResponse = await routeCompletionThroughGroq(groq, built.messages, {
      requestId,
      streamFromProvider: false
    });

    return jsonResponse({
      message: routedResponse.message,
      modelUsed: routedResponse.modelUsed,
      emergency: Boolean(routedResponse.emergency),
      chunksUsed: built.chunksUsed
    });
  } catch (error) {
    console.error(`[SYNAPSE PDF AI ${requestId}] Request failed:`, error?.message || error);

    return jsonResponse(
      {
        message: error?.message || SYNAPSE_AI_BUSY_MESSAGE
      },
      503
    );
  }
}
