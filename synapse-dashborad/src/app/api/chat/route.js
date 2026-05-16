import OpenAI from "openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "deepseek/deepseek-chat-v3-0324:free";
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
`;

function createOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
  });
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

    const completion =
      await openai.chat.completions.create({
        model:
          OPENROUTER_MODEL,

        messages: [
          {
            role: "system",

            content:
              SYSTEM_PROMPT,
          },

          ...messages,
        ],
      });

    return Response.json({
      message:
        completion.choices[0].message.content,
    });

  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: "Something went wrong",
      },
      {
        status: 500,
      }
    );
  }
}
