#!/usr/bin/env node
// Quick self-test: checks your OPENAI_API_KEY works and the default model answers.
// Usage:  OPENAI_API_KEY=sk-... npm run check-key
//         (optionally set OPENAI_MODEL and OPENAI_BASE_URL too)
import OpenAI from "openai";

const key = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";
if (!key) {
  console.error("OPENAI_API_KEY is not set. Example: OPENAI_API_KEY=sk-... npm run check-key");
  process.exit(1);
}

const client = new OpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL || undefined, timeout: 60000 });

try {
  console.log("1/2 Checking the key can list models...");
  let count = 0;
  let hasModel = false;
  for await (const m of client.models.list()) {
    count++;
    if (m.id === model) hasModel = true;
  }
  console.log(`    OK: ${count} models visible. Default model "${model}" ${hasModel ? "is available" : "was NOT found (set OPENAI_MODEL)"}.`);

  console.log(`2/2 Sending a test message to ${model}...`);
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: "Reply with exactly: bridge ok" }],
    max_completion_tokens: 50,
  });
  console.log(`    ChatGPT replied: ${res.choices[0]?.message?.content?.trim()}`);
  console.log("\nAll good. Your key works with the ChatGPT MCP Bridge.");
} catch (err) {
  console.error(`\nFailed (HTTP ${err?.status ?? "?"}): ${err?.message ?? err}`);
  if (err?.status === 401) console.error("The key was rejected. Create a new one at https://platform.openai.com/api-keys");
  if (err?.status === 429) console.error("Quota or rate limit reached. Check billing at https://platform.openai.com/settings/organization/billing");
  if (err?.status === 404) console.error("Model not found. Set OPENAI_MODEL to a model from step 1.");
  process.exit(1);
}
