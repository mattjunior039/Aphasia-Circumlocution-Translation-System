import { validateVocabulary } from "./engine.js";

export function validateBackup(value, builtInWords = []) {
  if (!value || value.version !== 1 || !Array.isArray(value.savedIds)
    || value.savedIds.some((id) => typeof id !== "string")
    || !Array.isArray(value.customWords)
    || value.customWords.some((word) => !word.id?.startsWith("custom-")
      || typeof word.label !== "string" || word.label.length > 60
      || typeof word.description !== "string" || word.description.length > 240)
    || !value.preferences || typeof value.preferences.largeText !== "boolean"
    || typeof value.preferences.highContrast !== "boolean") {
    throw new Error("This is not a supported Wordbridge backup.");
  }
  validateVocabulary([...builtInWords, ...value.customWords]);
  return value;
}
