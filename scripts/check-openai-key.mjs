#!/usr/bin/env node
// Quick self-test: checks every AI provider whose key is set actually answers.
// Usage:  OPENAI_API_KEY=sk-... GEMINI_API_KEY=... npm run check-key
// (Run `npm run build` first; this script uses the built provider catalogue.)
import OpenAI from "openai";
import { loadProviders } from "../dist/config.js";
import { pickModel } from "../dist/providers.js";

const providers = Object.values(loadProviders(process.env));
if (providers.length === 0) {
  console.error(
    "No AI provider key is set. Example:\n  OPENAI_API_KEY=sk-... npm run check-key\n" +
      "Run `node dist/index.js --providers` to see every supported provider and its key name.",
  );
  process.exit(1);
}

let failures = 0;
for (const p of providers) {
  const label = p.def.name;
  const client = new OpenAI({ apiKey: p.apiKey, baseURL: p.baseURL, timeout: 60000, maxRetries: 0 });
  try {
    let model = p.model;
    let ids = [];
    try {
      for await (const m of client.models.list()) ids.push(m.id);
    } catch {
      ids = []; // some providers do not list models; that is fine
    }
    if (!model || (ids.length && !ids.includes(model))) {
      const picked = pickModel(p.def, ids);
      if (model && picked) console.log(`  ${label}: default "${model}" not listed, will use "${picked}" instead.`);
      model = picked ?? model;
    }
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Reply with exactly: bridge ok" }],
      max_tokens: 50,
    });
    console.log(`OK   ${label} (${model}): ${res.choices[0]?.message?.content?.trim()}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${label}: HTTP ${err?.status ?? "?"} ${err?.message ?? err}`);
    if (err?.status === 401) console.error(`     The key was rejected. Get a new one at ${p.def.keyUrl}`);
    if (err?.status === 429) console.error("     Out of credit or rate limited. Check that provider's billing page.");
    if (err?.status === 404) console.error(`     Model not found. Set ${p.def.id.toUpperCase()}_MODEL to one your account has.`);
  }
}
console.log(failures ? `\n${failures} provider(s) failed.` : `\nAll ${providers.length} provider(s) work with the bridge.`);
process.exit(failures ? 1 : 0);
