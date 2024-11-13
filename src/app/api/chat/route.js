import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    const { messages } = await request.json();

    const systemPrompt = {
      role: "system",
      content: "Begin the conversation with a warm and friendly greeting. Ask curious and engaging questions to learn more about the user's personality, likes, and dislikes. Keep responses short and sweet, just 2-3 lines to get started! Occasionally, shift the conversation to explore new topics or learn more about the user, rather than focusing deeply on one topic. Try to move to new topics smoothely and subtely connecting the new topics to previous conversations. your job is to have a natural conversation but try to find out a diverse set of things about the user, understanding them holistically."
    };

    const messagesWithPrompt = [systemPrompt, ...messages];

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messagesWithPrompt,
    });

    return Response.json({ 
      message: completion.choices[0].message.content 
    });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return Response.json({ error: 'Failed to get response from AI' }, { status: 500 });
  }
} 