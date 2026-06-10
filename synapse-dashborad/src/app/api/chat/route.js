import {
  buildGroqMessages,
  buildSystemPrompt,
  normalizeChatMessages,
  routeCompletionThroughGroq,
  sleep,
  splitResponseForStreaming,
  SYNAPSE_AI_BUSY_MESSAGE
} from "../../../lib/aiModels.js";
import {
  buildUserContext,
  composeActionReply,
  executeAiAction,
  parseAiActionResponse
} from "../../../lib/aiContextEngine.js";
import { ConstitutionEngine } from "../../../lib/ai/constitutionEngine.js";
import { createGroqClient } from "../../../lib/groq.js";
import { fetchUserProfileFromFirestore, saveAiMemoryToFirestore } from "../../../lib/serverFirestore.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function getBearerToken(req) {
  const authorization = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] || "";
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

async function getRoutedGroqResponse(client, cleanMessages, systemPrompt, requestId, streamFromProvider = false) {
  return routeCompletionThroughGroq(
    client,
    buildGroqMessages(systemPrompt, cleanMessages),
    {
      requestId,
      streamFromProvider
    }
  );
}

function publicModelName() {
  return ConstitutionEngine.publicModelName("chat");
}

function directConstitutionResponse(req, body, message) {
  if (wantsStreaming(req, body)) {
    return streamingResponse(async ({ send }) => {
      send({
        type: "meta",
        modelUsed: publicModelName(),
        emergency: false,
        action: null,
        actionResult: null
      });

      for (const chunk of splitResponseForStreaming(message)) {
        send({
          type: "token",
          content: chunk
        });
        await sleep(8);
      }

      send({
        type: "done",
        modelUsed: publicModelName(),
        emergency: false,
        action: null,
        actionResult: null
      });
    });
  }

  return jsonResponse({
    message,
    modelUsed: publicModelName(),
    emergency: false,
    action: null,
    actionResult: null
  });
}

async function prepareAiResponse(rawMessage, uid, idToken, userContext, requestId, latestPrompt = "") {
  const parsedResponse = parseAiActionResponse(rawMessage);

  if (/\bclean Markdown user-facing answer\b/i.test(parsedResponse.reply || "")) {
    throw new Error("Invalid AI response placeholder.");
  }

  const actionResult = parsedResponse.action
    ? await executeAiAction(uid, idToken, parsedResponse.action, {
        context: userContext,
        requestId
      })
    : null;

  return {
    message: ConstitutionEngine.sanitizeResponse(
      composeActionReply(parsedResponse.reply, actionResult),
      latestPrompt
    ),
    action: parsedResponse.action,
    actionResult
  };
}

export async function POST(req) {
  const requestId =
    globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    console.info(`[SYNAPSE AI ${requestId}] Groq API request received.`);
    const body = await readJsonBody(req);
    const cleanMessages = normalizeChatMessages(body.messages);
    const latestPrompt = cleanMessages.filter((message) => message.role === "user").at(-1)?.content || "";

    if (!cleanMessages.length) {
      return jsonResponse(
        {
          message: "Ask SYNAPSE AI a question to begin."
        },
        400
      );
    }

    const constitutionReply = ConstitutionEngine.getDirectResponse(latestPrompt);

    if (constitutionReply) {
      console.info(`[SYNAPSE AI ${requestId}] Constitution direct response.`);
      return directConstitutionResponse(req, body, constitutionReply);
    }

    const groq = createGroqClient();

    if (!groq) {
      console.error(`[SYNAPSE AI ${requestId}] GROQ_API_KEY is missing.`);
      return jsonResponse({ message: SYNAPSE_AI_BUSY_MESSAGE }, 503);
    }

    const uid = typeof body.uid === "string" ? body.uid : "";
    const idToken = getBearerToken(req);
    const userProfile = uid && idToken ? await fetchUserProfileFromFirestore(uid, idToken, requestId) : null;
    const userContext = uid && idToken
      ? await buildUserContext(uid, {
          idToken,
          userProfile,
          requestId
        })
      : null;
    const systemPrompt = buildSystemPrompt(userProfile, userContext, latestPrompt, {
      voiceMode: Boolean(body.voiceMode)
    });

    if (uid && idToken) {
      saveAiMemoryToFirestore(uid, idToken, {
        latestPrompt,
        uploadedDocumentNames: body.uploadedDocumentNames,
        aiPreferences: {
          aiTone: userProfile?.aiTone || [],
          learningStyle: userProfile?.learningStyle || [],
          weakSubjects: userProfile?.weakSubjects || []
        }
      }, requestId);
    }

    console.info(
      `[SYNAPSE AI ${requestId}] Clean messages=${cleanMessages.length}; latestRole=${
        cleanMessages.at(-1)?.role || "none"
      }; stream=${Boolean(body.stream)}; personalization=${Boolean(userProfile?.onboardingCompleted)}; context=${Boolean(
        userContext
      )}`
    );

    if (wantsStreaming(req, body)) {
      return streamingResponse(async ({ send }) => {
        const routedResponse = await getRoutedGroqResponse(groq, cleanMessages, systemPrompt, requestId, true);
        const aiResponse = await prepareAiResponse(
          routedResponse.message,
          uid,
          idToken,
          userContext,
          requestId,
          latestPrompt
        );

        console.info(
          `[SYNAPSE AI ${requestId}] Streaming response ready. modelUsed=${
            routedResponse.modelUsed
          }; emergency=${Boolean(routedResponse.emergency)}; action=${aiResponse.action?.type || "none"}`
        );

        send({
          type: "meta",
          modelUsed: publicModelName(),
          emergency: Boolean(routedResponse.emergency),
          action: aiResponse.action,
          actionResult: aiResponse.actionResult
        });

        for (const chunk of splitResponseForStreaming(aiResponse.message)) {
          send({
            type: "token",
            content: chunk
          });
          await sleep(8);
        }

        send({
          type: "done",
          modelUsed: publicModelName(),
          emergency: Boolean(routedResponse.emergency),
          action: aiResponse.action,
          actionResult: aiResponse.actionResult
        });
      });
    }

    const routedResponse = await getRoutedGroqResponse(groq, cleanMessages, systemPrompt, requestId, false);
    const aiResponse = await prepareAiResponse(
      routedResponse.message,
      uid,
      idToken,
      userContext,
      requestId,
      latestPrompt
    );

    console.info(
      `[SYNAPSE AI ${requestId}] JSON response ready. modelUsed=${
        routedResponse.modelUsed
      }; emergency=${Boolean(routedResponse.emergency)}; action=${aiResponse.action?.type || "none"}`
    );

    return jsonResponse({
      message: aiResponse.message,
      modelUsed: publicModelName(),
      emergency: Boolean(routedResponse.emergency),
      action: aiResponse.action,
      actionResult: aiResponse.actionResult
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
