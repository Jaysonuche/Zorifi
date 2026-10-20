// Optional, device-local conversation memory. This module never imports Firebase
// or sends messages to a cloud service. The live app's approved personal-memory
// store remains separate; callers explicitly configure and enable this store.
const namespace = "zorifi-vanessa-conversation-memory-v1";
const sensitive = /(?:password|passcode|api[ _-]?key|access[ _-]?token|bearer\s+\S+|private[ _-]?key|seed phrase|recovery phrase|credit[ _-]?card|\bcvv\b|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export function createLocalMemoryService({storage, getCurrentUserId, isEnabled} = {}) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function" || typeof getCurrentUserId !== "function" || typeof isEnabled !== "function") {
    throw new TypeError("Local memory requires storage, an active-account resolver and an explicit memory preference.");
  }
  const allowed = userId => typeof userId === "string" && userId.length > 0 && userId.length <= 200 && userId === getCurrentUserId() && isEnabled(userId) === true;
  const key = userId => `${namespace}:${encodeURIComponent(userId)}`;
  const valid = item => item && ["user", "assistant", "model"].includes(item.role) && typeof item.content === "string" && item.content.length > 0 && item.content.length <= 4000 && !sensitive.test(item.content) && typeof item.timestamp === "string";
  const read = userId => {
    try {
      const value = JSON.parse(storage.getItem(key(userId)) || "[]");
      return Array.isArray(value) ? value.filter(valid).slice(-100) : [];
    } catch { return []; }
  };
  return {
    async saveMessageToMemory(userId, role, content, mode = "confidant") {
      if (!allowed(userId)) return false;
      if (!["user", "assistant", "model"].includes(role) || typeof content !== "string" || !content.trim() || content.length > 4000 || sensitive.test(content)) throw new TypeError("Memory must contain a short message without credentials.");
      const item = {role: role === "model" ? "assistant" : role, content: content.trim(), mode: mode === "director" ? "director" : "confidant", timestamp: new Date().toISOString()};
      storage.setItem(key(userId), JSON.stringify([...read(userId), item].slice(-100)));
      return true;
    },
    async loadUserMemory(userId, maxMessages = 15) {
      if (!allowed(userId)) return [];
      return read(userId).slice(-Math.max(1, Math.min(100, Math.floor(Number(maxMessages)) || 15)));
    },
    async clearUserMemory(userId) {
      if (typeof userId !== "string" || userId !== getCurrentUserId()) return false;
      storage.removeItem(key(userId));
      return true;
    },
  };
}

let configuredService = null;
export function configureMemoryService(options) {
  configuredService = options ? createLocalMemoryService(options) : null;
  return configuredService;
}
export async function saveMessageToMemory(...args) {return configuredService ? configuredService.saveMessageToMemory(...args) : false;}
export async function loadUserMemory(...args) {return configuredService ? configuredService.loadUserMemory(...args) : [];}
export async function clearUserMemory(...args) {return configuredService ? configuredService.clearUserMemory(...args) : false;}
