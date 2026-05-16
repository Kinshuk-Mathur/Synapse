import OpenAI from "openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODELS = [
  "deepseek/deepseek-v4-flash:free",
  "openrouter/free"
];
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
      "X-Title": "SYNAPSE AI",
    },
  });
}

function getOpenRouterMessage(error) {
  return error?.error?.message || error?.message || "OpenRouter request failed.";
}

function getFriendlyChatError(error) {
  if (error?.status === 401) {
    return "OpenRouter API key is invalid. Please check your OPENROUTER_API_KEY.";
  }

  if (error?.status === 402) {
    return "OpenRouter needs credits or free-model access for this request.";
  }

  if (error?.status === 429) {
    return "OpenRouter rate limit reached. Please wait a minute and try again.";
  }

  return getOpenRouterMessage(error);
}

export async function POST(req) {
  try {
    const openai = createOpenRouterClient();

    if (!openai) {
      return Response.json(
        {
          error: "OpenRouter API key is not configured.",
        },
        {
          status: 500,
        }
      );
    }

    const body = await req.json();

    const messages = body.messages || [];
    let completion = null;
    let lastError = null;

    for (const model of OPENROUTER_MODELS) {
      try {
        completion =
          await openai.chat.completions.create({
            model,

            messages: [
              {
                role: "system",

                content:
                  SYSTEM_PROMPT,
              },

              ...messages,
            ],
          });
        break;
      } catch (modelError) {
        lastError = modelError;

        if (modelError?.status !== 404) {
          throw modelError;
        }
      }
    }

    if (!completion) {
      throw lastError || new Error("No OpenRouter model is available right now.");
    }

    return Response.json({
      message:
        completion.choices[0].message.content,
    });

  } catch (error) {
    console.error("SYNAPSE AI chat error:", getOpenRouterMessage(error));

    return Response.json(
      {
        error: getFriendlyChatError(error),
      },
      {
        status: 500,
      }
    );
  }
}
