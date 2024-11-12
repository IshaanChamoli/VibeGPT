import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    const { messages } = await request.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
    });

    return Response.json({ 
      message: completion.choices[0].message.content 
    });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return Response.json({ error: 'Failed to get response from AI' }, { status: 500 });
  }
} 