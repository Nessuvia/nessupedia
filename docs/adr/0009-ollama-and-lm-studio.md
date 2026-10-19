# ADR 0009: Ollama and LM Studio as providers

## Status
Accepted. Adds two providers to ADR 0006.

## Context
ADR 0006 shelved Ollama and LM Studio until after the MVP. Both serve the same OpenAI-compatible `/v1` API the client already uses, so supporting them takes a preset and detection, not a new client. Two things differ from llama.cpp and koboldcpp: neither offers a tokenize endpoint, and neither lets a browser page from another origin call it by default.

## Decision
Add both as named local providers.
- Ollama: `http://localhost:11434/v1`. Context length comes from `/api/ps`, which reports the size the running model was loaded with.
- LM Studio: `http://localhost:1234/v1`. Context length comes from `loaded_context_length` in `/api/v0/models`.
- Token counts use a downloaded tokenizer or the estimate, as for cloud providers.
- Test connection reads the context length after its probe request, since both servers load the model on first use.
- When the browser can't connect, the help names the fix: `OLLAMA_ORIGINS` for Ollama, Enable CORS for LM Studio.

## Consequences
- Each provider says whether it counts tokens exactly (`exactTokens`), which is now separate from whether it's local.
- Ollama's loaded context is often smaller than the model supports (`OLLAMA_CONTEXT_LENGTH` raises it), so Test connection reports the real figure rather than the model's maximum.
- Both are tested against fake servers only until they've been run against real ones.
