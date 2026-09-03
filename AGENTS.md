# Instructions for AI Agents

## Image Transcription & PR Workflow

If the user prompt is simple feedback or a short phrase like **"process this"** or **"thanks"** (or similar minimal text) accompanied by an image:

1. **Check Existing Notebook File**: Use `pnpm run tail-notebook` (or `bun run scripts/tail-notebook.ts`) to read the last 10 lines of `notebook.md`.
2. **Transcribe Image & Deduplicate**: Read and transcribe handwritten text from the image into the notebook transcript format:
   ```markdown
   ## YYYY-MM-DD
   <note body>
   ☐ TAG1, ☐ TAG2
   ```
   Intelligently verify against the tail end of `notebook.md` to avoid duplicating notes that were partially or fully transcribed previously.
3. **Append New / Updated Notes**: Use `pnpm run append-notebook "<transcribed text>"` (or `bun run scripts/append-notebook.ts "<transcribed text>"`) to append new transcribed entries to `notebook.md`.
4. **Open Pull Request**: Create a new git branch (e.g. `transcription/YYYY-MM-DD`), commit the updated `notebook.md`, and open a Pull Request. This will trigger the GitHub Actions workflow to run a dry run of `runner.ts` and post the routing actions as a PR comment.
