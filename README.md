# notebook-router

`notebook-router` is a system for capturing, transcribing, parsing, and routing hand-written notebook entries to external services and local markdown document stores.

It parses transcribed notebook pages (stored in `notebook.md`), tracks routed items using checkboxes (`[ ]` for unprocessed, `[x]` for processed), and incrementally routes each note to its target destinations.

---

## Table of Contents

- [Tags & Routing Destinations](#tags--routing-destinations)
- [Mobile Capture & UI Flow](#mobile-capture--ui-flow)
- [Routing Mechanism](#routing-mechanism)
- [Setup & Environment Variables](#setup--environment-variables)
- [Configuration](#configuration)
- [Available Scripts](#available-scripts)

---

## Tags & Routing Destinations

| Tag | Destination | Description |
|-----|-------------|-------------|
| `PW` | Personal Writing | Appended to a markdown doc named for the note's date, in `PW_FOLDER` |
| `E`  | Sequential Notes | Appended to a markdown doc in `E_FOLDER`, assigned sequential target dates |
| `T`  | Todoist Inbox | Creates a Todoist task in Inbox, due today |
| `I`  | Todoist (Innerhelm) | Creates a Todoist task in the specified Innerhelm writing project |
| `EQ` | Todoist (EQP) | Creates a Todoist task in the specified EQP project |
| `R`  | Readwise | Creates a Readwise highlight under "Personal Notes" with the note date |
| `W`  | Email (Resend) | Sends an email containing the note via Resend |

Unrecognized tokens on tag lines are ignored rather than treated as destinations.

---

## Mobile Capture & UI Flow

The capture server (`server.ts`) hosts a web application (`public/capture.html`) optimized for mobile devices (smartphones/tablets) to photograph physical notebook pages and transcribe them using Claude (Anthropic Vision API). Once transcribed, the server opens a host-side text editor for human review and revision before appending the entry to `notebook.md`. The mobile interface instructs the user to continue on the host machine.

### How to Start

```bash
pnpm run capture
# or
bun run server.ts
```

When started, the server:
1. Resolves local LAN IP address and starts an HTTP server (default port `8000`).
2. Generates a unique single-session access token (`?t=<token>`).
3. Prints the full web URL and renders a QR code in the terminal. Scan the QR code with a mobile device on the same local network to open the capture interface.

### Capture & Revision Workflow

1. **Capture (Mobile Device)**
   - User takes or selects photo(s) of physical notebook page(s) using the device camera (`capture="environment"`).
   - Submitting sends a request (`POST /transcribe`) containing image payloads to the capture server.
   - The server calls Claude (`claude-3-5-sonnet-latest`) with the images and includes the recent tail of `notebook.md` for context (e.g. style and date structure).

2. **Review & Revision (Host Machine)**
   - The server automatically opens an external text editor on the host machine (configured via `editor` in `config.jsonc` or `EDITOR`/`VISUAL` environment variables, defaulting to `code --wait`) containing the draft transcript.
   - The mobile UI displays a message instructing the user to continue reviewing and saving the transcript on the host machine.
   - The user reviews, edits, and saves the transcript in the host editor. Upon closing the editor process, the server appends the finalized entry to `notebook.md`.

3. **Routing (Terminal / CLI)**
   - Routing is a separate command entirely (`pnpm run route`).
   - Results and execution logs are reported directly in the terminal output rather than in the mobile interface.

---

## Routing Mechanism

Routing is executed as a separate CLI command (`pnpm run route` or `bun run runner.ts`), and reports its results directly in the terminal.

### Transcript Format

`notebook.md` uses the following structure:

```markdown
## 2025-06-29
Text Dan about foobar
[ ] T

42 is the meaning of life
[ ] PW, [ ] R
```

### Parsing & Incremental Processing

1. **Unprocessed Item Detection:**
   The parser scans `notebook.md` for the first unprocessed checkbox (`[ ]`). It locates the date header (`## YYYY-MM-DD`) preceding this item and starts processing from that point onward.

2. **Destination Toggles:**
   Each tag on a note is evaluated against the active configuration. If a destination is disabled (e.g., `"w": false` in `config.jsonc`), items tagged for that destination are skipped and left as `[ ]` in `notebook.md`, while enabled destinations on the same note are processed.

3. **Incremental Disk Updates:**
   As each tag action succeeds, the router rewrites the checkbox for that tag in `notebook.md` from `[ ]` to `[x]`. This ensures that if processing fails mid-way (e.g., due to an API timeout), completed actions are saved and will not be re-run on subsequent executions.

4. **Dry-Run Mode:**
   Running with `--dry-run` or setting `DRY_RUN=1` simulates the full parse and route pipeline without making API calls or modifying `notebook.md`.

```bash
# Preview routing actions without side-effects
pnpm run route --dry-run
```

---

## Setup & Environment Variables

### Prerequisites

- Node.js / Bun runtime
- `pnpm` (recommended package manager)

### Installation

```bash
pnpm install
cp .env.example .env
```

### Environment Variables (`.env`)

Configure the following environment variables in `.env` (or environment):

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for image transcription | Yes (for capture server) |
| `TODOIST_API_TOKEN` | Todoist API token for creating tasks | Yes |
| `TODOIST_INNERHELM_PROJECT_ID` | Todoist Project ID for `I` tagged notes | Yes |
| `TODOIST_EQP_PROJECT_ID` | Todoist Project ID for `EQ` tagged notes | Yes |
| `READWISE_API_TOKEN` | Readwise Access Token for `R` tagged notes | Yes |
| `RESEND_API_KEY` | Resend API key for `W` tagged email notes | Yes |
| `RESEND_FROM_EMAIL` | Sender email address for Resend (default: `notebook@yourdomain.com`) | No |
| `NOTEBOOK_EMAIL_TO` | Recipient email address for Resend | No |
| `PW_FOLDER` | Storage directory path for `PW` notes (default: `./notes/personal-writing`) | No |
| `E_FOLDER` | Storage directory path for `E` notes (default: `./notes/e`) | No |
| `PORT` | HTTP server port for capture UI (default: `8000`) | No |
| `NOTEBOOK_FILE` | Path to the notebook markdown file (default: `./notebook.md`) | No |

*Note: Todoist Project IDs can be found in the URL when opening a project in Todoist web or via `GET https://api.todoist.com/rest/v2/projects`.*

---

## Configuration

`notebook-router` supports optional JSONC configuration files (`config.jsonc` or `config.json`). The system automatically loads `config.jsonc` or `config.json` if present in the working directory, or you can supply a path using `--config`.

Example `config.jsonc`:

```jsonc
{
  "port": 8000,
  "notebookPath": "notebook.md",
  "envPath": ".env",
  "pwFolder": "./notes/personal-writing",
  "eFolder": "./notes/e",
  "editor": "code --wait",
  "destinations": {
    "pw": true,
    "e": true,
    "t": true,
    "i": true,
    "eq": true,
    "r": true,
    "w": false // Set to false to disable Resend routing without marking 'W' as processed in notebook.md
  }
}
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm run capture` | Starts local mobile capture & transcription web server (`server.ts`) |
| `pnpm run route` | Executes notebook item parser and router (`runner.ts`) |
| `pnpm run tail-notebook` | Displays recent entries from `notebook.md` |
| `pnpm run test` | Runs the Vitest test suite |
