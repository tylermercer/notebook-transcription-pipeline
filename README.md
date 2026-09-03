# notebook-router

Parses a single transcribed notebook file (`notebook.md`), tracks routed items using checkboxes (`☐` for unprocessed, `☑` for processed), and routes each note to its destination.

## Tags

| Tag | Destination |
|-----|-------------|
| `PW` | Appended to a markdown doc named for the note's date, in `PW_FOLDER` |
| `E`  | Appended to a markdown doc in `E_FOLDER` with sequential dates |
| `T`  | Todoist Inbox task, due today |
| `I`  | Todoist task in the `Innerhelm Writing` project |
| `EQ` | Todoist task in the `South Hills EQP` project |
| `R`  | Readwise highlight in the "Personal Notes" book (author Tyler Mercer), note field carries the notebook date |
| `W`  | Email to `tmercer+notebook@lucidchart.com` via Resend |

Unrecognized tokens on a tag line (e.g. a stray `OR`) are ignored rather than treated as destinations.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in tokens + Todoist project IDs
```

Todoist project IDs: open the project in Todoist web, the ID is the number
in the URL, or fetch via `GET /rest/v2/projects` with your token.

## Run

```bash
# Execute routing script on default notebook file (notebook.md)
bun run runner.ts

# Execute routing script on a specific file
bun run runner.ts path/to/notebook.md

# Run in dry-run mode (previews routing actions without making changes)
bun run runner.ts --dry-run
```

Transcript format expected in `notebook.md`:

```markdown
## 2025-06-29
Reach out to Kenneth
☐ PW

42 is the meaning of life
☐ PW, ☐ R
```

The script scans for the first unprocessed checkbox (`☐`) and processes items serially. After each item is processed (when not in `--dry-run` mode), the checkbox in `notebook.md` is updated from `☐` to `☑`.

## Transcriber Utility Scripts

To assist transcribers in viewing existing notes and appending new notes without duplication:

- **Tail notebook**: `pnpm run tail-notebook` (displays the last 10 lines of `notebook.md`)
- **Append note**: `pnpm run append-notebook "<text to append>"` (appends text to `notebook.md`)

## Notebook Pages & GitHub Actions Workflow

- **`notebook.md` Single File Pipeline**: The primary transcription log is stored in `notebook.md` in the root directory.
- **PR Dry Run**: Opening or updating a PR that touches `notebook.md` triggers a GitHub Actions pipeline that executes `runner.ts --dry-run` and comments the predicted actions directly on the PR.

## Cloudflare Worker MCP Server

The project includes a Vite-built Cloudflare Worker exposing a Model Context Protocol (MCP) server over SSE.

### Tool: `get_context`
Exposes the `get_context` tool which returns `AGENTS.md` instructions and the tail of `notebook.md`.

### Environment Variable & Authentication
Requests are protected using Bearer token authentication against the `BEARER_TOKEN` secret.

To set the `BEARER_TOKEN` secret in Cloudflare Workers using Wrangler:
```bash
npx wrangler secret put BEARER_TOKEN
```

### GitHub Actions Secrets
The GitHub Actions deployment workflow (`.github/workflows/deploy.yml`) requires two repository secrets for Cloudflare deployment:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

To set these secrets via the GitHub CLI (`gh`):
```bash
gh secret set CLOUDFLARE_API_TOKEN --body "your_cloudflare_api_token"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "your_cloudflare_account_id"
```
