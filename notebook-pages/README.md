# Notebook Pages & Single File Pipeline

Note: The notebook transcription pipeline now uses a single `notebook.md` file in the root directory for all transcriptions.

## Transcript Format

`notebook.md` uses date headers (`## YYYY-MM-DD`) and checkbox-prefixed destination tags:

```markdown
## 2025-06-29
Gratitude is an emotional experience...
☐ PW, ☐ R

I need to be more patient w/ the flaws of church leaders...
☐ PW
```

When items are processed by `runner.ts`, unprocessed checkboxes (`☐`) are updated to processed checkboxes (`☑`).

## Transcriber Utilities

- `pnpm run tail-notebook` — View the last 10 lines of `notebook.md`.
- `pnpm run append-notebook "<text>"` — Append new transcribed text to `notebook.md`.
