import test from "node:test";
import assert from "node:assert/strict";
import { validateBackup } from "../search/backup.js";

const word = { id: "custom-maya", label: "Maya", category: "People", description: "A granddaughter who plays cello", aliases: [], clues: [] };
const backup = { version: 1, customWords: [word], savedIds: ["custom-maya", "phone"], preferences: { largeText: false, highContrast: true } };
test("valid backups preserve personal IDs and old saved IDs", () => {
  assert.deepEqual(validateBackup(backup), backup);
});
test("unsupported or corrupt backups do not become success-shaped empty data", () => {
  for (const value of [null, {}, { ...backup, version: 2 }, { ...backup, customWords: [{ ...word, id: "phone" }] }, { ...backup, savedIds: [1] }]) {
    assert.throws(() => validateBackup(value), /supported|Invalid/);
  }
});
