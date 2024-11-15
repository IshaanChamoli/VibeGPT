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

    const prompt = `Analyze only the USER's messages in this conversation:
    ${conversationText}

    Respond only with three comma-separated lists:
    1. Core traits shown: [direct personality traits, no explanations]
    2. Topics & interests mentioned: [specific subjects discussed]
    3. Match indicators: [traits for ideal social matching]`;

    // Get the analysis from GPT-4
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an analyzer that responds only with precise, comma-separated traits and characteristics. No explanations or full sentences."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "gpt-4-turbo-preview",
      temperature: 0.3,
      max_tokens: 200
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