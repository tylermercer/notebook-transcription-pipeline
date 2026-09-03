# Instructions for AI Agents

## Image Transcription & PR Workflow

If the user prompt is simple feedback or a short phrase like **"process this"** or **"thanks"** (or similar minimal text) accompanied by an image:

1. **Transcribe Image**: Read and transcribe the handwritten text from the image into the notebook transcript format:
   ```markdown
   YYYY-MM-DD
   <note body>
   <tags e.g. PW, T, R>
   ```
2. **Create Markdown File**: Place the transcribed markdown file in the `notebook-pages/` directory named by date (e.g., `notebook-pages/YYYY-MM-DD.md`). If a file for that date already exists, append a numerical suffix (e.g., `notebook-pages/YYYY-MM-DD-2.md`).
3. **Open Pull Request**: Create a new git branch (e.g. `transcription/YYYY-MM-DD`), commit the new file, and open a Pull Request. This will trigger the GitHub Actions workflow to run a dry run of `runner.ts` and post the routing actions as a PR comment.
