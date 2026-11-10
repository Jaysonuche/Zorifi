import { loadUserMemory, saveMessageToMemory } from "./memoryService.js";
import { callVanessaAI } from "./chatService.js";

const MEMORY_SAVE_WARNING = "Vanessa replied, but this conversation could not be saved to local memory.";
const CHAT_FAILURE_REPLY = "I'm having trouble connecting to my cognitive cores right now, but I'm still here with you. Let's try that again in a moment.";

export function createVanessaMessageHandler({
  loadMemory = loadUserMemory,
  saveMemory = saveMessageToMemory,
  askVanessa = callVanessaAI,
} = {}) {
  if (typeof loadMemory !== "function" || typeof saveMemory !== "function" || typeof askVanessa !== "function") {
    throw new TypeError("A memory loader, memory saver, and Vanessa AI service are required.");
  }

  return async function handleVanessaUserMessage(userId, userMessage, currentMode = "confidant") {
    try {
      if (typeof userId !== "string" || !userId.trim()) {
        throw new TypeError("A user ID is required.");
      }
      if (typeof userMessage !== "string" || !userMessage.trim()) {
        throw new TypeError("A non-empty user message is required.");
      }

      const memoryHistory = await loadMemory(userId, 15);
      const aiResponse = await askVanessa(memoryHistory, userMessage);
      if (!aiResponse || typeof aiResponse.text !== "string" || !aiResponse.text.trim() || typeof aiResponse.provider !== "string") {
        throw new TypeError("Vanessa did not return a complete response.");
      }

      try {
        const userSaved = await saveMemory(userId, "user", userMessage, currentMode);
        const assistantSaved = userSaved
          ? await saveMemory(userId, "model", aiResponse.text, currentMode)
          : false;
        return {
          success: true,
          provider: aiResponse.provider,
          reply: aiResponse.text,
          memorySaved: userSaved && assistantSaved,
          ...(!userSaved || !assistantSaved ? { memoryWarning: MEMORY_SAVE_WARNING } : {}),
        };
      } catch (error) {
        console.error("Vanessa conversation could not be saved to local memory:", error);
        return {
          success: true,
          provider: aiResponse.provider,
          reply: aiResponse.text,
          memorySaved: false,
          memoryWarning: MEMORY_SAVE_WARNING,
        };
      }
    } catch (error) {
      console.error("Chat interaction failed:", error);
      return {
        success: false,
        reply: CHAT_FAILURE_REPLY,
      };
    }
  };
}

export const handleVanessaUserMessage = createVanessaMessageHandler();
