# AI teams: make the AIs work together with Claude

`ai_team` turns the AIs you have switched on into a team that Claude directs. Each member gets a role, they see each other's work, and they improve it over several rounds. Claude stays in charge: it sets the task, picks the team, checks the result and tells you which AI did what.

## Three ways of working

### 1. Review loop (`mode: "review"`)

The first member is the **author**; the others are **reviewers**.

```text
author writes draft ─► reviewers critique (in parallel) ─► author revises ─► repeat (up to 3 rounds)
                                       │
                                       └─ stops early when every reviewer says APPROVED
```

Give it a `draft` and the team improves **Claude's own work** (or yours) instead of starting from scratch. This is the most useful mode: Claude writes, the team checks.

### 2. Discussion (`mode: "discussion"`)

Every member answers. Then each reads the others' answers and refines its own, pointing out mistakes and changing its mind where persuaded. The last round gives final positions, which Claude summarises for you.

### 3. Pipeline (`mode: "pipeline"`)

Members work in order, each seeing everything done before it, like an assembly line:

```text
researcher (Gemini) ─► writer (ChatGPT) ─► editor (Grok) ─► finished result
```

## Roles

Built in: `author`, `coder`, `reviewer`, `critic`, `security`, `tester`, `researcher`, `writer`, `editor`, `planner`, `devils_advocate`, `summariser`, `expert`.

Or write your own, for example `"role": "a UK employment lawyer checking for legal risk"` or `"role": "a first-time customer reading this page"`.

## Examples to say to Claude

**Code**

- *"Write a function to validate UK postcodes, then run an AI team review on it: ChatGPT as reviewer, Grok as security, Gemini as tester."*
- *"Use ai_team in review mode with src/auth.ts shared: DeepSeek as coder (author), ChatGPT as reviewer, Claude as security. Three rounds."*
- Use the **team_build** prompt: Claude plans, the team critiques the plan, Claude builds, the team reviews the code.

**Work**

- *"Draft a reply to this complaint email, then have an AI team (ChatGPT as editor, Gemini as critic) improve your draft."*
- *"Run an AI team pipeline for a blog post about our new service: Perplexity as researcher, ChatGPT as writer, Gemini as editor."*
- *"Hold an AI team discussion, 2 rounds, ChatGPT, Gemini and Grok as devil's advocate: should we open a second branch next year?"*
- Use the **team_write** prompt for researcher, writer and editor in one step.

## Sharing files with the team

The AIs can read text and code files, but only from folders you approve:

```json
"env": {
  "ALLOWED_FILE_DIRS": "/Users/YOUR_NAME/projects/my-app",
  "OPENAI_API_KEY": "sk-...",
  "GEMINI_API_KEY": "..."
}
```

Then: *"Share src/index.ts and src/config.ts with the team and review them."*

Safety rules built in:

- File sharing is **off** until `ALLOWED_FILE_DIRS` is set. Several folders can be listed, separated by commas.
- Nothing outside those folders can be read: `../` tricks and shortcuts (symlinks) that point outside are blocked.
- Only text files; images, PDFs, Office files and other binary files are refused.
- Size limits: 200 KB per file (`MAX_FILE_BYTES`) and 600 KB per request (`MAX_TOTAL_FILE_BYTES`).
- Remember that shared files are sent to each AI company in the team. Do not share confidential material unless their terms allow it.

## Saving and continuing a session

Give the session a name with `team_id` (for example `"login-refactor"`). The whole session is saved; see it with `chatgpt_get_conversation`. Call `ai_team` again with the same `team_id` and the new team starts from the previous final result: *"Continue team login-refactor: now add tests."*

## Cost control

A team session makes several AI calls. Before starting, the bridge works out the maximum number and refuses if it is above `MAX_TEAM_CALLS` (default 20):

| Mode | Calls |
| --- | --- |
| review | 1 (first draft, skipped if you give one) + rounds × members |
| discussion | members × rounds |
| pipeline | members |

Example: review mode, 3 members, 2 rounds = 1 + 2 × 3 = 7 calls (fewer if the reviewers approve early). Every reply shows the number of calls and tokens used.

## What happens when something fails

- A reviewer fails: the others' reviews are still used.
- A discussion member fails: it drops out; the rest carry on.
- A pipeline step fails, or the review author fails: the session stops and shows everything done so far.

Failures are shown in the transcript with the reason and a fix.
