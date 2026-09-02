# notebook-router

Parses a transcribed notebook page (date header, note text, checkbox tag
line) and routes each note to the right destination.

## Tags

| Tag | Destination |
|-----|-------------|
| `PW` | Appended to a markdown doc named for the note's date, in `PW_FOLDER` |
| `E`  | Same as `PW`, but in `E_FOLDER` |
| `T`  | Todoist Inbox task, due today |
| `I`  | Todoist task in the `Innerhelm Writing` project |
| `EQ` | Todoist task in the `South Hills EQP` project |
| `R`  | Readwise highlight in the "Personal Notes" book (author Tyler Mercer), note field carries the notebook date |
| `W`  | Email to `tmercer+notebook@lucidchart.com` via Resend |

Unrecognized tokens on a tag line (e.g. a stray `OR`) are ignored rather
than treated as destinations.

## Setup

```bash
bun install
cp .env.example .env   # fill in tokens + Todoist project IDs
```

Todoist project IDs: open the project in Todoist web, the ID is the number
in the URL, or fetch via `GET /rest/v2/projects` with your token.

## Run

```bash
bun run src/runner.ts path/to/transcript.txt
```

Transcript format expected (plain text, one note per tag line):

```
2025-06-29
Gratitude is an emotional experience...
PW, OR
I need to be more patient w/ the flaws of church leaders...
PW
```

## Portability to Cloudflare Workers

Everything that talks to the outside world is isolated behind small
interfaces so this can become a Worker later with minimal churn:

- **Storage**: `KVStorage` (`src/storage.ts`) has just `get`/`put`, matching
  the shape of a Workers KV binding. `FileKVStorage` is the only
  Bun-specific piece (uses `Bun.file`/`Bun.write`) — swap it for a
  `KVNamespace`-backed or D1-backed class that implements the same
  interface and nothing in `router.ts` needs to change.
- **Config**: `loadConfig()` takes a plain `Record<string, string | undefined>`,
  so it works identically against `process.env` (Bun) or the `env` object
  Workers pass into `fetch(request, env, ctx)`.
- **API clients**: `TodoistClient`, `ReadwiseClient`, `ResendClient` use the
  global `fetch`, which is available in both Bun and Workers unchanged.
- **Entry point**: `src/runner.ts` is the only Bun-only file (CLI arg
  parsing, `Bun.file`). A future `src/worker.ts` would import `parseTranscript`,
  `routeNotes`, `loadConfig`, and the client classes exactly as-is.
