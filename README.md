# notebook-router

Parses a single transcribed notebook file (`notebook.md`, not in this repo), tracks routed items using checkboxes (`☐` for unprocessed, `☑` for processed), and routes each note to its destination.

## Tags

| Tag | Destination |
|-----|-------------|
| `PW` | Appended to a markdown doc named for the note's date, in a folder specified by `PW_FOLDER` |
| `E`  | Appended to a markdown doc in a folder specified by `E_FOLDER`, with sequential dates |
| `T`  | Todoist Inbox task, due today |
| `I`  | Todoist task in a project for my writing for [Innerhelm](https://innerhelm.com) |
| `EQ` | Todoist task in a specific project |
| `R`  | Readwise highlight in the "Personal Notes" book, note field carrying the notebook date |
| `W`  | Email to work email via Resend |

Unrecognized tokens on a tag line are ignored rather than treated as destinations.

## Configuration

`notebook-router` supports JSONC configuration files (with comments and trailing commas).
An auto-detected config file `config.jsonc` or `config.json` in the same directory as the script will be used automatically, or you can specify a config file via the `--config` (`-c`) flag.

Example `config.jsonc`:

```jsonc
{
  "port": 8000,
  "notebookPath": "notebook.md",
  "envPath": ".env",
  "destinations": {
    "pw": true,
    "e": true,
    "t": true,
    "i": true,
    "eq": true,
    "r": true,
    "w": false // Set to false to disable routing to Resend without checking off 'W' in notebook.md
  }
}
```

Paths in the config file are relative to the location of the config file itself.

If a destination is set to `false`, items tagged for that destination will be skipped and left unprocessed (`☐`) in `notebook.md`, while other enabled destinations for the same item will still be processed.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in tokens + Todoist project IDs
cp config.example.jsonc config.jsonc # optional configuration file
```

Todoist project IDs: open the project in Todoist web, the ID is the number
in the URL, or fetch via `GET /rest/v2/projects` with your token.

## Run

```bash
# Execute routing script (uses default or config notebook path)
bun run runner.ts

# Execute routing script with explicit config or file path
bun run runner.ts --config my-config.jsonc
bun run runner.ts path/to/notebook.md

# Run in dry-run mode (previews routing actions without making changes)
bun run runner.ts --dry-run
```

Transcript format expected in `notebook.md`:

```markdown
## 2025-06-29
Text Dan about foobar
☐ T

42 is the meaning of life
☐ PW, ☐ R
```

The script scans for the first unprocessed checkbox (`☐`) and processes items serially. After each item is processed (when not in `--dry-run` mode), the checkbox in `notebook.md` is updated from `☐` to `☑`. This allows the processing to be resumed easily if one item fails, without redoing past successful work.
