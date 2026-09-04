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

To initialize the project, install dependencies, copy `.env.example` to `.env`, and configure Cloudflare secrets on GitHub:

```bash
pnpm run init
```

Alternatively, set up manually:

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

## Cloudflare Worker MCP Server (`notebook-router-mcp`)

The project includes a stateless MCP server built for Cloudflare Workers using `agents/mcp/server` and `@modelcontextprotocol/server`. It allows AI clients (e.g. Claude on mobile) to inspect existing notes for deduplication and submit new transcriptions via GitHub Pull Requests.

### Tools

1. **`get_notebook_tail`**
   - Fetches the last N lines of `notebook.md` from the base branch on GitHub for deduplication context.
   - Returns tail text, file blob `sha`, and total line count.

2. **`append_notebook_entry`**
   - Takes transcribed markdown text and expected blob `sha`.
   - Runs shallow structural format validation (`validate.ts`).
   - Creates a new branch, appends content to `notebook.md` using SHA-gated update, and opens a Pull Request.

### Authentication & Secrets

The worker enforces two-layer security:
- **`MCP_BEARER_TOKEN`**: Static bearer token checked on every request before reaching the MCP handler. Fails closed (rejects with 401) if unconfigured or invalid.
- **`GITHUB_TOKEN`**: Fine-grained GitHub PAT (scoped to `Contents: Read and write`, `Pull requests: Read and write`) stored as a Worker secret.

To set worker secrets using Wrangler:
```bash
npx wrangler secret put MCP_BEARER_TOKEN
npx wrangler secret put GITHUB_TOKEN
```

### Wrangler Configuration (`wrangler.jsonc`)

Environment variables in `wrangler.jsonc`:
- `GITHUB_OWNER`: GitHub repository owner
- `GITHUB_REPO`: Repository name (`notebook-router`)
- `GITHUB_BASE_BRANCH`: Target base branch (`main`)
- `NOTEBOOK_PATH`: Path to target file (`notebook.md`)

### Design Rationale

- **Stateless Handler**: Replaces legacy stateful transport with `createMcpHandler` from `agents/mcp/server`. Avoids isolate state mismatch issues across Cloudflare Worker invocations.
- **SHA Gating**: Concurrency is enforced via GitHub's `expected_sha` blob version check to prevent silent overwrites.
- **Auto-resolving Branch Collisions**: Retries once with a timestamp suffix if a branch name collision occurs and logs it in the PR body.
- **PR-and-Stop Boundary**: Keeps the human review step (GitHub Actions dry-run comment) and side-effecting `runner.ts` execution as explicit, deliberate actions.
