# Tool reference

Every tool returns readable text for Claude plus `structuredContent` (machine-readable JSON) where useful. Failures come back as tool errors with a **How to fix** line rather than crashing the server.

All chat tools accept these optional settings:

| Input | Type | Notes |
| --- | --- | --- |
| `provider` | string | Which AI: `openai`, `anthropic`, `gemini`, `xai`, `deepseek`, `mistral`, `meta`, `perplexity`, `moonshot`, `qwen`, `cohere`, `groq`, `openrouter`, `ollama`, `lmstudio` (or aliases `chatgpt`, `claude`, `grok`, `kimi`, `llama`). Default: `DEFAULT_PROVIDER`. |
| `model` | string | Any model ID your key can use. Default: `OPENAI_MODEL`. Must be in `ALLOWED_MODELS` if that is set. |
| `temperature` | number 0 to 2 | Lower is more focused. Dropped automatically for models that do not accept it. |
| `max_output_tokens` | integer | Reply length limit. Default: `MAX_OUTPUT_TOKENS`. |
| `reasoning_effort` | `minimal` / `low` / `medium` / `high` | Reasoning models only. Dropped automatically if unsupported. |

Each reply ends with a footer such as:

```text
---
[model: gpt-5.6-sol | tokens: 212 in / 388 out | conversation: launch-ideas | turns kept: 3]
```

---

## `ai_ask`

Same as `chatgpt_ask`, but `provider` is required, so Claude uses it whenever you name an AI ("ask Gemini...").

```json
{ "provider": "gemini", "message": "Summarise the main argument of this paragraph: ..." }
```

---

## `ai_panel`

Asks several AIs the same question at once and returns every answer side by side.

| Input | Required | Notes |
| --- | --- | --- |
| `message` | yes | The question. |
| `providers` | no | e.g. `["openai", "gemini", "grok"]`. Default: every configured provider (up to 8). |
| `system_prompt` | no | Applied to every AI. |
| `max_output_tokens` | no | Per AI. |

AIs that are not configured, or that fail, are reported in their own section with a fix; the others still answer.

---

## `ai_team`

Several AIs work together on a task with roles. Full guide: [TEAMWORK.md](TEAMWORK.md).

| Input | Required | Notes |
| --- | --- | --- |
| `task` | yes | What to produce or decide. |
| `members` | yes | 2 to 6 of `{ provider, role?, model? }`. In review mode the first is the author. |
| `mode` | no | `review` (default), `discussion` or `pipeline`. |
| `rounds` | no | 1 to 3 (default 2). Review stops early when all reviewers approve. |
| `draft` | no | Review mode: an existing draft (e.g. Claude's) for the team to improve. |
| `context` | no | Background for the whole team. |
| `files` | no | Text/code files to share (from `ALLOWED_FILE_DIRS` only). |
| `team_id` | no | Save the session; reuse to continue from the last result. |

Returns the final result, who produced it, and a transcript of every contribution. Structured output includes `final`, `final_by`, `calls`, `tokens` and each `turn`.

---

## `ai_list_providers`

Shows all 15 providers, which are switched on (with their default models), and the exact setting that switches each of the others on. Never shows keys.

---

## `chatgpt_ask`

Send a message to ChatGPT.

| Input | Required | Notes |
| --- | --- | --- |
| `message` | yes | Everything ChatGPT needs. It cannot see the Claude conversation. |
| `conversation_id` | no | Reuse to continue a thread. Letters, numbers, `-`, `_`; max 64 chars. Omit for a one-off question. |
| `system_prompt` | no | Role or style instructions. Applied only when a thread starts. Falls back to `DEFAULT_SYSTEM_PROMPT`. |
| `files` | no | Paths of text/code files to attach (only inside `ALLOWED_FILE_DIRS`). |

**One-off example**

```json
{ "message": "In two sentences, what is the difference between TCP and UDP?" }
```

**Multi-turn example**

```json
{ "message": "Let's plan a 3-day trip to Edinburgh. Start with day 1.", "conversation_id": "edinburgh-trip" }
{ "message": "Great. Now day 2, with a rainy-day alternative.", "conversation_id": "edinburgh-trip" }
```

Turns are only saved after ChatGPT replies successfully, so a failed call never leaves a half-finished turn in the history.

Structured output: `{ reply, model, usage, conversation_id?, new_conversation? }`.

---

## `chatgpt_second_opinion`

Ask ChatGPT to critique an answer. The reply is structured as **Verdict**, **What is right**, **What is wrong, missing or risky**, and **A better answer**.

| Input | Required | Notes |
| --- | --- | --- |
| `question` | yes | The original question or task. |
| `answer` | yes | The answer, plan or draft to review (often Claude's own). |
| `focus` | no | e.g. `"factual accuracy"`, `"security"`, `"tone for a client email"`. |

Default temperature: 0.3.

---

## `chatgpt_code_review`

| Input | Required | Notes |
| --- | --- | --- |
| `code` | yes | The code. |
| `language` | no | Used for the code fence and context. |
| `context` | no | What the code is for. |
| `focus` | no | Array of `bugs`, `security`, `performance`, `readability`, `tests`, `style`. |

Each issue is reported with severity (critical / major / minor / nit), location, problem and fix. Default temperature: 0.2.

---

## `chatgpt_debate`

| Input | Required | Notes |
| --- | --- | --- |
| `position` | yes | The claim, decision or plan to test. |
| `stance` | no | `against` (default), `for`, or `both`. |
| `rounds_context` | no | Arguments already made, so ChatGPT can respond to them. |

---

## `chatgpt_compare_models`

Runs one prompt on several models at the same time.

| Input | Required | Notes |
| --- | --- | --- |
| `message` | yes | The prompt. |
| `models` | yes | 2 to 8 entries: model IDs (`gpt-5.6-sol`), provider names (`gemini`, `grok`) or `provider:model` (`xai:grok-4.6`). Duplicates are skipped. |
| `system_prompt` | no | Applied to every model. |
| `max_output_tokens` | no | Per model. |

If one model fails (for example, not available on your account) the others still answer; the failure is shown in that model's section with a fix hint. Structured output: `{ results: [{ model, ok, text | error, ms, usage }] }`.

---

## `chatgpt_structured`

Asks for a single JSON object using OpenAI's JSON mode, then parses it (tolerating a stray code fence).

| Input | Required | Notes |
| --- | --- | --- |
| `instruction` | yes | What to produce. |
| `json_shape` | yes | A description of the object, e.g. `{"people": [{"name": string, "role": string}]}`. |
| `input` | no | Source text to work on. |

Structured output: `{ valid_json: true, data: {...} }`, or `{ valid_json: false, raw: "..." }` if the model did not return valid JSON. Default temperature: 0.

---

## `chatgpt_generate_image`

| Input | Required | Notes |
| --- | --- | --- |
| `prompt` | yes | A detailed description. |
| `size` | no | `auto`, `1024x1024`, `1536x1024` (landscape), `1024x1536` (portrait). |
| `quality` | no | `auto`, `low`, `medium`, `high`. |
| `count` | no | 1 to 4. |
| `model` | no | Default `OPENAI_IMAGE_MODEL`. |

Images come back as MCP image content, so Claude can see them. If `IMAGE_OUTPUT_DIR` is set they are also saved as PNG files and the paths are listed.

---

## `chatgpt_list_conversations`, `chatgpt_get_conversation`, `chatgpt_reset_conversation`

Manage threads created by `chatgpt_ask`.

- `chatgpt_list_conversations`: newest first, with title (from the first message), turn count and model.
- `chatgpt_get_conversation { conversation_id }`: full history.
- `chatgpt_reset_conversation { conversation_id }` or `{ all: true }`: forget threads.

Threads are also available as MCP resources at `chatgpt://conversations/{id}`.

---

## `chatgpt_list_models`

| Input | Notes |
| --- | --- |
| `filter` | Substring, e.g. `"gpt-6"` or `"image"`. |
| `chat_only` | Defaults to `true` when no filter is given (hides embeddings, audio, etc.). |

The default model is marked `(default)`.

---

## `chatgpt_server_info`

Shows version, default models, base URL, limits and storage settings. Shows `api_key_set: true/false`, never the key.
