import { VANESSA_SYSTEM_PROMPT } from "../config/vanessaCore.js";

function environmentValue(name) {
  return typeof process === "undefined" ? "" : process.env[name] || "";
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    throw new TypeError("history must be an array.");
  }

  return history.map((message) => {
    if (!message || !["user", "model", "assistant"].includes(message.role)) {
      throw new TypeError("Each history item must have a user, model, or assistant role.");
    }

    const content = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.parts)
        ? message.parts.map((part) => part?.text || "").join("")
        : "";
    if (!content.trim()) {
      throw new TypeError("Each history item must contain text.");
    }

    return {
      role: message.role === "user" ? "user" : "assistant",
      content,
    };
  });
}

async function requestChatCompletion(request, provider, url, apiKey, model, history, userMessage, signal, extraHeaders = {}) {
  const response = await request(url, {
    method: "POST",
    signal,
    redirect: "error",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: VANESSA_SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider} returned HTTP ${response.status}.`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (data?.error || data?.choices?.[0]?.finish_reason !== "stop" || typeof text !== "string" || !text.trim()) {
    throw new Error(`${provider} did not return a complete response.`);
  }
  return text;
}

/**
 * Sends Vanessa's chat to the configured providers in priority order.
 * Provider API keys must remain in the server environment.
 */
export function createVanessaChatService({
  getEnvironment = environmentValue,
  request = (...args) => fetch(...args),
  createGemini = async (apiKey) => {
    const { GoogleGenAI } = await import("@google/genai");
    return new GoogleGenAI({apiKey, vertexai: false, httpOptions: {timeout: 30000, retryOptions: {attempts: 1}}});
  },
} = {}) {
 return async function callVanessaAI(history, userMessage, {signal} = {}) {
  if (typeof window !== "undefined") throw new Error("Provider credentials may only be used on the server.");
  if (signal?.aborted) throw signal.reason || new Error("Vanessa request was cancelled.");
  const value = name => String(getEnvironment(name) || "").trim();
  const requestSignal = () => signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
  const cancelled = () => {if (signal?.aborted) throw signal.reason || new Error("Vanessa request was cancelled.");};
  const chatHistory = normalizeHistory(history);
  if (typeof userMessage !== "string" || !userMessage.trim()) {
    throw new TypeError("userMessage must be a non-empty string.");
  }

  const geminiApiKey = value("GEMINI_API_KEY");
  const groqApiKey = value("GROQ_API_KEY");
  const openRouterApiKey = value("OPENROUTER_API_KEY") || value("AI_PROVIDER_KEY");
  if (!geminiApiKey && !groqApiKey && !openRouterApiKey) {
    throw new Error("No AI providers are configured for Vanessa.");
  }

  if (geminiApiKey) {
    try {
      // Use the deployed model setting rather than a retired SDK-era default.
      const modelId = value("GEMINI_MODEL");
      if (!modelId) throw new Error("Configure GEMINI_MODEL for the Gemini provider.");
      const ai = await createGemini(geminiApiKey);
      const model = ai.chats.create({
        model: modelId,
        config: { systemInstruction: VANESSA_SYSTEM_PROMPT, abortSignal: requestSignal(), maxOutputTokens: 2048 },
        history: chatHistory.map((message) => ({
          role: message.role === "user" ? "user" : "model",
          parts: [{ text: message.content }],
        })),
      });
      const result = await model.sendMessage({ message: userMessage });
      if (result?.promptFeedback?.blockReason || result?.candidates?.[0]?.finishReason !== "STOP" || typeof result.text !== "string" || !result.text.trim()) {
        throw new Error("Gemini did not return a complete response.");
      }
      return { provider: "Gemini", text: result.text };
    } catch {
      cancelled();
      console.warn("Gemini failed; trying the next configured provider.");
    }
  }

  if (groqApiKey) {
    try {
      const text = await requestChatCompletion(
        request,
        "Groq",
        "https://api.groq.com/openai/v1/chat/completions",
        groqApiKey,
        value("GROQ_MODEL") || "openai/gpt-oss-20b",
        chatHistory,
        userMessage,
        requestSignal(),
      );
      return { provider: "Groq", text };
    } catch {
      cancelled();
      console.warn("Groq failed; trying the next configured provider.");
    }
  }

  if (openRouterApiKey) {
    try {
      const text = await requestChatCompletion(
        request,
        "OpenRouter",
        "https://openrouter.ai/api/v1/chat/completions",
        openRouterApiKey,
        value("OPENROUTER_MODEL") || value("AI_PROVIDER_MODEL") || "openrouter/free",
        chatHistory,
        userMessage,
        requestSignal(),
        {
          "HTTP-Referer": "https://zorifi.vercel.app",
          "X-Title": "Zorifi Vanessa",
        },
      );
      return { provider: "OpenRouter", text };
    } catch {
      cancelled();
      throw new Error("All AI providers (Gemini, Groq, OpenRouter) are currently unavailable.");
    }
  }

  throw new Error("All configured AI providers (Gemini and Groq) are currently unavailable.");
 };
}

export const callVanessaAI = createVanessaChatService();

/**
 * Sends a message to Vanessa and returns only the response text.
 * @param {Array<{role: "user" | "model" | "assistant", content?: string, parts?: Array<{text: string}>}>} chatHistory
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export async function sendToVanessa(chatHistory, userMessage) {
  const result = await callVanessaAI(chatHistory, userMessage);
  return result.text;
}
