# ADR 0006: Supported LLM providers

## Status
Accepted. Ollama and LM Studio added by ADR 0009.

## Context
The Assistant talks to a user-supplied OpenAI-compatible endpoint straight from the browser. Servers differ in what they offer beyond `/chat/completions`: exact token counts, the loaded model's context length, its tokenizer family, and whether browsers may call them at all (CORS). Each provider we support needs testing against a real setup, and the author runs koboldcpp and llama.cpp locally.

## Options
- Generic OpenAI-compatible only
- A named set of providers, each with a preset and detection, plus a generic option
- Every common provider, Ollama and LM Studio included

## Decision
Five providers in the MVP: llama.cpp, koboldcpp, OpenRouter, NanoGPT, and generic OpenAI-compatible. Each named one has a preset base URL and uses what that server offers for token counts, context length, and tokenizer family. Generic covers any other compatible endpoint without provider code. Ollama and LM Studio are shelved until post-MVP: they may work as generic endpoints, but they aren't tested or specially supported, and both need browser access turned on by hand.

## Consequences
- Every chat request uses the same OpenAI-compatible shape; only detection differs by provider.
- Local servers give exact token counts and context length; cloud and generic endpoints fall back to a downloaded tokenizer or an estimate.
- Adding a provider later means a preset and its detection, not a new client.
