# Design: Mobile Capture & Transcription Server

## Summary

Add a `bun run capture` command that starts a local HTTP server, prints a QR
code to the terminal, and serves a single mobile-friendly page. From that
page you photograph one or more notebook pages with your phone's camera
(via a plain file input, no `getUserMedia`), the server sends the image(s)
to the Anthropic API for transcription, you review/edit the transcript in a
textarea, and on submit the server appends it to `notebook.md` and runs the
same routing logic `runner.ts` already uses — reporting what was
routed/created.

This replaces the manual "photo → AI agent transcribes → PR" loop described
in `AGENTS.md` with a same-device loop that doesn't require opening a PR for
routine entries. It should reuse, not duplicate, the existing `parse.ts` /
`router.ts` / `storage.ts` / `runner.ts` logic.

## Non-goals

- No live camera preview / multi-frame capture UI. `capture="environment"`
  hands off to the phone's native camera app; we just receive the resulting
  file(s).
- No auth system, no HTTPS, no multi-user support. This is a single-user,
  same-LAN, ephemeral tool.
- No change to the GitHub Actions PR workflow — it keeps working as an
  independent path for anyone who prefers it (or for async transcription).
- No persistent job queue / retry system for the Anthropic call. If it
  fails, the user just retries in the browser.

## User flow

1. User runs `bun run capture` (or `bun run capture path/to/notebook.md`).
2. Terminal prints a QR code encoding `http://<lan-ip>:<port>/?t=<token>`.
3. User scans it, phone opens the page (token in the URL authorizes that
   phone's session — see **Security** below).
4. Page shows a "photograph a page" file input
   (`<input type="file" accept="image/*" capture="environment" multiple>`).
   User can attach more than one photo (multi-page entries) before
   submitting.
5. Browser POSTs the image(s) to the server. Server calls the Anthropic API
   with the image(s) plus the tail of `notebook.md` for dedup context (same
   idea `AGENTS.md` already describes for the manual flow), gets back a
   draft transcript in the existing `## YYYY-MM-DD / body / ☐ TAG` format,
   and returns it to the browser.
6. Page shows the draft in a `<textarea>` for editing.
7. User taps "Append & Process". Server appends the (possibly edited) text
   to `notebook.md` using the same logic as `scripts/append-notebook.ts`,
   then runs the real (non-dry-run) processing pass — same code path as
   `runner.ts`'s `processFile` — and returns a report of what was routed.
8. Page shows the report (per-tag actions taken, same shape as the existing
   dry-run log lines) and resets to the capture screen for the next page.

## Architecture

New pieces, reusing existing modules wherever possible:

```
server.ts                  <- new entry point (bun run capture)
public/capture.html        <- new static page served at GET /
clients/anthropic.ts        <- new client, same shape as clients/todoist.ts etc.
lib/qr.ts                  <- new, thin wrapper around a qr-terminal lib
runner.ts                  <- refactor: export processFile (see below)
```

Nothing in `config.ts`, `storage.ts`, `parse.ts`, `router.ts`, or the
existing clients needs to change in shape — the server is a new caller of
the same `AppConfig` / `KVStorage` / `RouteDeps` / `routeNote` contracts
those files already define.

### `runner.ts` refactor

`processFile` is currently a private async function only reachable via the
`import.meta.main` CLI path. Export it (and its `mkdir` setup step) so
`server.ts` can call the exact same logic instead of re-implementing
"parse → route → check off tags":

```ts
// runner.ts
export async function processFile(
  filePath: string,
  isDryRun: boolean,
  config: AppConfig,
): Promise<{ notesProcessed: number; tagActionsProcessed: number; logLines: string[] }>
```

Today `processFile` writes its report straight to `console.log`. Change it
to accept an optional `logger` (mirroring `RouteDeps.logger`, defaulting to
`console.log`) and to return a summary object so the server can render the
report in the HTTP response instead of only printing it. Keep the CLI
behavior identical — `main()` just passes `console.log` explicitly (or
relies on the default) and ignores the return value.

Also export `mkdir`-the-storage-folders as part of `processFile` (or a
small helper) since the server needs the same "ensure PW/E folders exist"
step the CLI does today, once, before serving.

### `clients/anthropic.ts`

Unlike the other clients in `clients/` (which hand-roll `fetch` against
each API), use the official `@anthropic-ai/sdk` package here — confirmed
via a working playground snippet, and it saves reimplementing streaming /
image-block handling by hand. This is a deliberate deviation from the
"plain fetch" convention `todoist.ts`/`readwise.ts`/`resend.ts` follow;
worth a one-line comment in the file noting why.

```ts
import Anthropic from "@anthropic-ai/sdk";

export interface TranscribeImagesParams {
  images: { data: string; mediaType: string }[]; // base64
  /** Tail of notebook.md, for dedup context (handles partial-page re-shoots) */
  recentNotebookTail: string;
}

const SYSTEM_PROMPT = `Read and transcribe handwritten text from the image(s) into this transcript format:
\`\`\`markdown
## YYYY-MM-DD
<note body>
☐ <tag1>, ☐ <tag2>
\`\`\`
Where the tags are one of R, PW, W, I, E, etc. Render the checkboxes as ☐ if they're unchecked and ☑ if they're checked.

You will also be given the tail end of the existing notebook.md file for context. Some or all of the content in the photographed page(s) may have already been transcribed there — this happens when a page is re-photographed after a partial capture. Compare the handwritten content against that existing tail and omit any note that's already present, so only genuinely new content is transcribed.`;

export class AnthropicClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async transcribeImages(params: TranscribeImagesParams): Promise<string> {
    const stream = this.client.messages.stream({
      model: "claude-sonnet-5",
      max_tokens: 20000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...params.images.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, data: img.data, media_type: img.mediaType as any },
            })),
            {
              type: "text" as const,
              text: `Existing tail of notebook.md, for dedup reference:\n\n${params.recentNotebookTail}`,
            },
          ],
        },
      ],
    });

    let transcript = "";
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        transcript += chunk.delta.text;
      }
    }
    return transcript;
  }
}
```

Notes:

- Multiple images go in a single `content` array on one user message (per
  the confirmed decision below), not one call per image. The
  `recentNotebookTail` text block goes in that same array, after the
  images — this keeps it one call and lets the model reference both
  directly.
- `recentNotebookTail` should come from the same "read the file, take the
  last N lines" logic `scripts/tail-notebook.ts` already implements —
  reuse that rather than reimplementing it in `server.ts`. Worth
  extracting the tail-reading logic out of `scripts/tail-notebook.ts` into
  a small shared function both the script and `server.ts` can call, rather
  than having `server.ts` shell out to the script or duplicate the
  file-read-and-slice logic inline.
- `media_type` typing: the SDK's `source.media_type` is a narrow union
  (`"image/jpeg" | "image/png" | "image/gif" | "image/webp"`); either
  validate/narrow the incoming upload's MIME type before passing it
  through, or cast as shown above — validating is safer given this takes
  arbitrary phone-camera uploads.
- The `Anthropic()` constructor also picks up credentials from `ant auth
  login` if no `apiKey` is passed, per the SDK's default behavior — but
  since `config.ts` already centralizes all credential loading via
  `loadConfig`/`.env`, keep passing `apiKey` explicitly here rather than
  relying on that fallback, for consistency with the rest of the repo.

Config addition needed in `config.ts` / `.env.example`:

```
ANTHROPIC_API_KEY=
```

Add it to `AppConfig` (`anthropic: { apiKey: string }`) and to
`loadConfig`'s `required(...)` calls, following the exact pattern already
used for `TODOIST_API_TOKEN` etc., including the `allowMissing` mock-value
behavior (`config.test.ts` will need a matching case).

### `server.ts`

Bun's built-in `Bun.serve()` — no new HTTP framework needed, nothing else
in this repo pulls one in.

Routes:

| Method | Path         | Purpose |
|--------|--------------|---------|
| GET    | `/`          | Serve `public/capture.html`, requires `?t=<token>` (see Security) |
| POST   | `/transcribe`| Body: multipart form with 1+ image files. Reads the current notebook file's tail (same lines `scripts/tail-notebook.ts` would show) and calls `AnthropicClient.transcribeImages` with both. Returns `{ transcript: string }` |
| POST   | `/commit`    | Body: `{ transcript: string }`. Appends to notebook file (same formatting as `scripts/append-notebook.ts`), then calls `processFile(filePath, /* isDryRun */ false, config)`, returns the report object |

All POST routes also require the `t` token (header or query param — pick
one and be consistent with what `capture.html`'s `fetch()` calls send).

Startup sequence in `server.ts`:

1. `loadConfig(process.env)` — **not** `allowMissing`, since this path
   makes real API calls and needs real credentials.
2. Resolve `filePath` from `process.argv` same as `runner.ts` does
   (default `notebook.md`).
3. `mkdir` the storage folders (reuse whatever `runner.ts` now exports for
   this).
4. Generate a random token (`crypto.randomUUID()` is fine).
5. Start `Bun.serve({ port, fetch: handler })`. Default port is `8000`;
   support a `--port <n>` CLI arg to override (parse it alongside the
   existing `filePath` / `--dry-run`-style arg handling in `runner.ts`'s
   `main()`, e.g. `bun run capture --port 9000 notebook.md`). Bind
   `0.0.0.0` so the phone can reach it.
6. Determine the LAN IP to embed in the QR payload — Bun doesn't have a
   built-in "get my LAN IP" call, so use Node's `os.networkInterfaces()`
   (available in Bun) and pick the first non-internal IPv4 address.
7. Print the URL and render a QR code for it in the terminal via `lib/qr.ts`.

### `lib/qr.ts`

Thin wrapper around a terminal QR package (e.g. `qrcode-terminal`) so
`server.ts` just calls `printQr(url)`. Add the dependency to
`package.json`. No need for the `qrcode` (image-generating) package since
we're not rendering it in the browser — only in the terminal.

### `public/capture.html`

Single static file, vanilla JS (no build step needed — nothing else in
this repo has a frontend bundler, and adding Vite/etc. for one page would
be disproportionate). Three simple states rendered/hidden with plain DOM
manipulation:

1. **Capture**: `<input type="file" accept="image/*" capture="environment" multiple>` + "Transcribe" button. POSTs to `/transcribe`.
2. **Review**: `<textarea>` pre-filled with the returned transcript,
   editable, + "Append & Process" button. POSTs to `/commit`.
3. **Report**: renders the returned log lines, + "Capture another page"
   button that resets to state 1.

Keep styling minimal (this is a personal utility, not a product) but usable
one-handed on a phone screen — big tap targets, no hover-dependent UI.

## Security

This binds to the LAN with no login system, so:

- The token from step 4 above is generated fresh each server run and
  required on every route (`/`, `/transcribe`, `/commit`). No token, no
  access — return 401.
- Don't log the token or the full URL anywhere persistent; terminal output
  only.
- Document in the README that this is intended for trusted home networks
  only, same trust model as e.g. a Chromecast.
- Out of scope for v1, worth a follow-up note in the doc: binding to a
  specific interface instead of `0.0.0.0`, or adding a "shut down after N
  minutes idle" timer so a stale server doesn't sit open indefinitely.

## Image handling

- Accept images as `multipart/form-data` in `/transcribe` — Bun's `Request`
  supports `.formData()` natively, no extra dependency needed.
- Convert to base64 in memory and pass directly to `AnthropicClient`; no
  need to write images to disk. Keep them out of scope entirely once the
  response is sent (don't persist captured photos — only the resulting
  text goes into `notebook.md`, consistent with the rest of this repo
  never storing binary assets).
- Cap upload size (e.g. reject requests with combined image size over some
  sane limit like 20MB) to avoid an accidental huge upload stalling the
  Anthropic call.

## Testing

Follow the existing project convention (`vitest`, one `*.test.ts` per
module, mock `fetch` for network clients):

- `clients/anthropic.test.ts` — since this client wraps `@anthropic-ai/sdk`
  rather than raw `fetch`, it can't follow the `vi.stubGlobal("fetch", ...)`
  pattern the other client tests use. Instead, mock the SDK module itself
  (`vi.mock("@anthropic-ai/sdk", ...)`, or inject the `Anthropic` instance
  via the constructor so a fake with a `messages.stream` async generator
  can be passed in directly — prefer the injectable-instance approach, it's
  more in keeping with this repo's existing preference for plain
  constructor injection over module mocking). Assert: the model
  (`claude-sonnet-5`), the image content blocks match the images passed
  in, a trailing text block contains `recentNotebookTail`, and the
  streamed `text_delta` chunks are concatenated correctly into the
  returned transcript.
- `runner.test.ts` additions — test the refactored `processFile` returns a
  correct summary object (in addition to the existing
  `checkOffTagInContent` tests already there).
- `config.test.ts` additions — assert `ANTHROPIC_API_KEY` is required and
  gets the `[DRY_RUN_MOCK_...]` treatment under `allowMissing`.
- `server.ts` itself is mostly wiring (Bun.serve, os.networkInterfaces,
  terminal QR printing) — not worth heavy unit testing. If anything,
  extract the token-check and the "pick a LAN IP" logic into small pure
  functions in a separate file so *those* can be unit tested without
  spinning up a real server.
- No new test needed for `public/capture.html` — it's a thin client with
  no logic worth unit testing in isolation; a manual test pass (photograph
  a real page, confirm it round-trips into `notebook.md` correctly) is the
  right level of rigor here.

## package.json changes

```json
{
  "scripts": {
    "capture": "bun run server.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x",
    "qrcode-terminal": "^0.12.0"
  }
}
```

(`qrcode-terminal` and `@anthropic-ai/sdk` go in `dependencies`, not
`devDependencies`, since they're needed at runtime — unlike
`vitest`/`typescript` which are dev-only. Pin `@anthropic-ai/sdk` to
whatever the current major is at implementation time.)

## Decisions (previously open questions)

- **Model**: `claude-sonnet-5`, `max_tokens: 20000`, confirmed working via
  playground testing — see the `clients/anthropic.ts` spec above for the
  exact system prompt used.
- **Port**: defaults to `8000`; overridable via a `--port <n>` CLI arg
  (not `.env` — keep it a run-time flag like `--dry-run` already is).
- **Multi-page capture**: single Anthropic call with all images attached
  to one user message's `content` array, confirmed — not one call per
  page.
- **Dedup context**: the tail of `notebook.md` is included as a text block
  in the same call, so the model can skip content that was already
  transcribed from a prior partial-page capture — see the
  `clients/anthropic.ts` spec above.

## Open questions for Jules to flag back if unclear

None outstanding — flag anything that comes up during implementation.

## Out of scope / follow-ups (don't build now)

- Idle auto-shutdown timer.
- HTTPS / real auth if this ever needs to work off the home LAN.
- Retry/resume if the Anthropic call fails mid-transcription.
- Any UI polish beyond "usable on a phone."
