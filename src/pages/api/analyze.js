import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body;

    // Format messages for analysis
    const conversationText = messages
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');

    const prompt = `Analyze the following conversation between a user and an AI assistant. 
    Focus on identifying key personality traits, interests, communication style, and potential compatibility factors for social matching OF THE USER based on their responses to the AI. The AI messages are simply provided for context, do not analyse the AI.
    Provide a concise analysis that could be used to match this person with others who have similar traits or complementary characteristics.

    Conversation:
    ${conversationText}

    Please provide your analysis in the following format:
    - Personality Traits:
    - Interests & Topics:
    - Communication Style:
    - Potential Compatibility Factors:`;

    // Get the analysis from GPT-4
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a skilled personality analyst and social matching expert. Your goal is to provide insightful analysis of conversations to help match people with similar or complementary traits."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "gpt-4-turbo-preview",
      temperature: 0.7,
      max_tokens: 500
    });

    const analysis = completion.choices[0].message.content;

    // Generate embedding for the analysis
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: analysis,
      encoding_format: "float",
    });

    // Return both the analysis and its embedding
    res.status(200).json({ 
      analysis,
      embedding: embedding.data[0].embedding
    });

  } catch (error) {
    console.error("Error in analyze API:", error);
    res.status(500).json({ 
      error: "Failed to analyze messages",
      details: error.message 
    });
  }
} 