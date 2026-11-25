# Using other OpenAI-compatible providers

The bridge uses the OpenAI Chat Completions API format, which many providers and local tools also offer. Set `OPENAI_BASE_URL` (and a matching `OPENAI_MODEL`). Tool names stay `chatgpt_*` whichever model answers; the reply footer always shows the real model.

## OpenRouter (many models through one key)

```json
"env": {
  "OPENAI_API_KEY": "sk-or-...",
  "OPENAI_BASE_URL": "https://openrouter.ai/api/v1",
  "OPENAI_MODEL": "openai/gpt-5.6-sol"
}
```

Model IDs on OpenRouter include the vendor prefix. Check their model list for current names.

## Ollama (free, runs on your computer)

1. Install [Ollama](https://ollama.com) and pull a model: `ollama pull llama3.1`
2. Configure:

```json
"env": {
  "OPENAI_API_KEY": "ollama",
  "OPENAI_BASE_URL": "http://localhost:11434/v1",
  "OPENAI_MODEL": "llama3.1"
}
```

The key can be any non-empty text. Image generation is not available.

## LM Studio

Start the local server in LM Studio (Developer tab), then:

```json
"env": {
  "OPENAI_API_KEY": "lm-studio",
  "OPENAI_BASE_URL": "http://localhost:1234/v1",
  "OPENAI_MODEL": "the-model-id-shown-in-lm-studio"
}
```

## Azure OpenAI

Azure offers an OpenAI-compatible `v1` endpoint for its resources. Use your deployment name as the model:

```json
"env": {
  "OPENAI_API_KEY": "your-azure-key",
  "OPENAI_BASE_URL": "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
  "OPENAI_MODEL": "your-deployment-name"
}
```

Check Microsoft's current documentation for the exact endpoint format your resource supports.

## Compatibility notes

- If a provider rejects `max_completion_tokens`, the bridge automatically retries with the older `max_tokens`.
- Unsupported `temperature`, `reasoning_effort` or JSON mode (`response_format`) are dropped and retried; the footer shows `ignored unsupported: ...`.
- `chatgpt_list_models` needs the provider to implement `GET /models`.
- `chatgpt_generate_image` needs an `images/generations` endpoint that returns base64 data.
