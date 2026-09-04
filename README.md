# notebook-router

Parses a single transcribed notebook file (`notebook.md`, not in this repo), tracks routed items using checkboxes (`☐` for unprocessed, `☑` for processed), and routes each note to its destination.

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

Unrecognized tokens on a tag line are ignored rather than treated as destinations.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in tokens + Todoist project IDs
```

Todoist project IDs: open the project in Todoist web, the ID is the number
in the URL, or fetch via `GET /rest/v2/projects` with your token.

## Run

```bash
# Execute routing script on a specific file
bun run runner.ts path/to/notebook.md

# Run in dry-run mode (previews routing actions without making changes)
bun run runner.ts --dry-run path/to/notebook.md
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
