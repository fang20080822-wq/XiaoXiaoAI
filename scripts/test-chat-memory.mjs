import assert from "node:assert/strict";
import {
  CHAT_HISTORY_LIMIT,
  buildChatMessages,
  buildChatSummaryMessages,
  formatChatHistory,
  normalizeChatSummary
} from "../lib/chat-memory.js";

const descRows = Array.from({ length: 20 }, (_, index) => ({
  role: index % 2 === 0 ? "assistant" : "user",
  content: "message-" + (20 - index)
}));
const history = formatChatHistory(descRows);
assert.equal(history.length, CHAT_HISTORY_LIMIT);
assert.equal(history[0].content, "message-5");
assert.equal(history.at(-1).content, "message-20");

const piiFiltered = formatChatHistory([
  { role: "assistant", content: "safe reply" },
  { role: "user", content: "phone 13812345678" }
], (value) => value.includes("13812345678"));
assert.deepEqual(piiFiltered.map((item) => item.content), ["safe reply"]);

const messages = buildChatMessages("system rules", "topic: plants", history, "new question");
assert.equal(messages[0].content, "system rules");
assert.match(messages[1].content, /topic: plants/);
assert.equal(messages.at(-1).content, "new question");
assert.equal(messages.length, history.length + 3);

const summaryInput = buildChatSummaryMessages("older summary", [
  { role: "user", content: "I am testing plant watering." },
  { role: "assistant", content: "Keep light and soil the same." }
]);
assert.equal(summaryInput[0].role, "system");
assert.match(summaryInput[0].content, /不得推断或编造/);
assert.match(summaryInput[1].content, /older summary/);
assert.match(summaryInput[1].content, /plant watering/);
assert.equal(normalizeChatSummary("x".repeat(3000)).length, 2200);

console.log("V5.10 chat memory helper tests passed.");
