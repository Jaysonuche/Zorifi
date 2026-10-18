import { GoogleGenAI } from "@google/genai";
import { VANESSA_SYSTEM_PROMPT, VANESSA_CONFIG } from "../config/vanessaCore.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY must be configured before using the Vanessa chat service.");
}

const ai = new GoogleGenAI({ apiKey });

/**
 * Sends a message to Vanessa with her system prompt and prior conversation history.
 * @param {Array<{role: "user" | "model", parts: Array<{text: string}>}>} chatHistory
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export async function sendToVanessa(chatHistory, userMessage) {
  if (!Array.isArray(chatHistory)) {
    throw new TypeError("chatHistory must be an array.");
  }
  if (typeof userMessage !== "string" || !userMessage.trim()) {
    throw new TypeError("userMessage must be a non-empty string.");
  }

  const chat = ai.chats.create({
    model: VANESSA_CONFIG.model,
    config: {
      systemInstruction: VANESSA_SYSTEM_PROMPT,
      temperature: VANESSA_CONFIG.temperature,
      maxOutputTokens: VANESSA_CONFIG.maxOutputTokens,
    },
    history: chatHistory,
  });

  const result = await chat.sendMessage({ message: userMessage });
  if (typeof result.text !== "string") {
    throw new Error("Gemini returned no text for Vanessa's response.");
  }
  return result.text;
}
