# Contributing

Thanks for helping. Bug reports, docs fixes, new tools and provider notes are all welcome.

## Getting set up

```bash
git clone https://github.com/myrahossain36-svg/chatgpt-mcp-bridge.git
cd chatgpt-mcp-bridge
npm install
npm test
```

Tests use a fake backend, so you do not need an OpenAI key to work on the code.

## Workflow

1. Open an issue first for anything bigger than a small fix, so we can agree the approach.
2. Create a branch: `git checkout -b feat/short-description`.
3. Make the change with tests. Run `npm run typecheck && npm test`.
4. Update the docs (`README.md`, `docs/`) if behaviour or settings change, and add a line to `CHANGELOG.md` under **Unreleased**.
5. Open a pull request describing what changed and why.

## Guidelines

- TypeScript, strict mode, ES modules.
- Never write to stdout outside the MCP transport. Use the logger.
- Never log or return secrets.
- Tool descriptions should say when Claude should use the tool.
- Keep errors actionable: say what went wrong and how to fix it.
- Keep dependencies minimal.

## Good first contributions

- Docs for another OpenAI-compatible provider
- A new prompt in `src/prompts.ts`
- Translations of the README
- Examples of real workflows in `examples/USAGE-IDEAS.md`

By contributing you agree your work is released under the MIT licence.
