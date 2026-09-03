# Notebook Pages

This directory contains markdown transcription files for handwritten notebook pages.

## File Naming Convention

Files placed in this directory should be named using ISO dates, e.g., `YYYY-MM-DD.md` (for example, `2025-06-29.md`).

## Transcript Format

Each file should contain plain text notes organized under a date header (`YYYY-MM-DD`) and ended with a tag line specifying destination tags:

```markdown
2025-06-29
Gratitude is an emotional experience...
PW, OR

I need to be more patient w/ the flaws of church leaders...
PW
```

## Available Tags

| Tag | Destination |
|---|---|
| `PW` | Appended to a markdown doc named for the note's date, in `PW_FOLDER` |
| `E` | Appended to a markdown doc in `E_FOLDER` with sequential dates |
| `T` | Todoist Inbox task, due today |
| `I` | Todoist task in the Innerhelm Writing project |
| `EQ` | Todoist task in the South Hills EQP project |
| `R` | Readwise highlight in the "Personal Notes" book |
| `W` | Email via Resend |

## GitHub Actions Integration

When a pull request adds or modifies markdown files in `notebook-pages/`, a GitHub Actions workflow will automatically run `runner.ts` in **dry-run** mode to show what routing actions would occur, and post the output as a comment on the PR. When the PR is merged, the workflow will run again to process the notes.
