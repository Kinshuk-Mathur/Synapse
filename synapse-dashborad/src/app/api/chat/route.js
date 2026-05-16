import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",

  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req) {
  try {
    const body = await req.json();

    const messages = body.messages || [];

    const completion =
      await openai.chat.completions.create({
        model:
          "deepseek/deepseek-chat-v3-0324:free",

        messages: [
          {
            role: "system",

            content: `
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
            `,
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