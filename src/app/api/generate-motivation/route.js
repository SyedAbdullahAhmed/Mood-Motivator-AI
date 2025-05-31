// app/api/generate-motivation/route.ts
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

if (!GEMINI_API_KEY || !ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
  throw new Error("Missing API keys or Voice ID in environment variables");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const elevenlabs = new ElevenLabsClient({
  apiKey: ELEVENLABS_API_KEY,
});

const generationConfig = {
  temperature: 0.7,
  topK: 1,
  topP: 1,
  maxOutputTokens: 2048,
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

export async function POST(req) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string' || text.trim() === "") {
      return NextResponse.json({ error: "Input text is required and must be a non-empty string." }, { status: 400 });
    }

    // 1. Get Quote and Role Model from Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Based on the following user's feeling or situation, provide an inspiring, motivational quote and a strong, well-known role model ( warriors, innovators, etc.) who exemplifies overcoming similar challenges or embodies the spirit of the quote.Give extremely practical plus mindset builiding and actionable advice that can be applied in real life.
      Try to avoid generic quotes and role models, focusing instead on those that are truly impactful and relevant to the user's input. And use simple language that is easy to understand.And give new quote every time, qutoe should be one liner.Suggest modals, all Muslim warriors, Western Inoovators, like Steve Jobs, Elon Musk,Bill Gates etc.

      User's input: "${text}"

      Return your response ONLY as a JSON object with two keys: "quote" (string) and "roleModel" (string).
      Example: {"quote": "The only way to do great work is to love what you do.", "roleModel": "Steve Jobs - Developer and Entrepreneur"}
      Be concise and ensure the quote is genuinely motivational.
    `;

    console.log("Sending to Gemini:", prompt);
    const result = await model.generateContent(prompt);
    const geminiResponseText = result.response.text();
    console.log("Gemini Raw Response:", geminiResponseText);

    let quoteData = { quote: "", roleModel: "" };
    try {
      // Clean the response: Gemini might wrap it in ```json ... ```
      const cleanedResponse = geminiResponseText.replace(/^```json\s*|```\s*$/g, '').trim();
      quoteData = JSON.parse(cleanedResponse);
    } catch (e) {
      console.error("Error parsing Gemini JSON response:", e, "Raw:", geminiResponseText);
      // Fallback if JSON parsing fails
      quoteData = {
        quote: "Believe you can and you're halfway there.",
        roleModel: "Theodore Roosevelt"
      };
      // Or, try to extract from a non-JSON response if possible, though risky.
      // For now, just using a default.
    }

    if (!quoteData.quote || !quoteData.roleModel) {
      console.error("Gemini did not return expected structure. Received:", quoteData);
      // Provide a default if structure is wrong
      quoteData = {
        quote: "The journey of a thousand miles begins with a single step.",
        roleModel: "Lao Tzu"
      };
    }



    const audioStream = await elevenlabs.textToSpeech.convert(ELEVENLABS_VOICE_ID, {
      text: quoteData.quote,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
    });

    // Convert stream to Buffer to send it easily; for larger files, streaming directly is better
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    // Return audio as blob with quote and role model in headers
    const response = new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Quote': encodeURIComponent(quoteData.quote),
        'X-RoleModel': encodeURIComponent(quoteData.roleModel),
      },
    });
    return response;

  } catch (error) {
    console.error("Error in /api/generate-motivation:", error);
    let errorMessage = "Failed to generate motivation.";
    if (error.message) errorMessage += ` Details: ${error.message}`;
    if (error.response && error.response.data) {
      errorMessage += ` API Response: ${JSON.stringify(error.response.data)}`;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
