# Design: Idempotency Keys for Todoist and Resend

## Summary

Add a deterministic, content-derived idempotency key to every Todoist
(`T`/`I`/`EQ`) and Resend (`W`) API call made from `router.ts`. Today the
checkbox mechanism in `notebook.md` guarantees a tag is never *routed*
twice once it's marked `[x]`, but the write to disk happens *after* the
API call succeeds (see `runner.ts`'s `processFile` loop). If the process
dies between the API call returning success and the checkbox being
written, the next run re-sends the same action and creates a duplicate
Todoist task or a duplicate email. This closes that gap by making the
retry a no-op on the provider's side instead of relying on the checkbox
write happening every time.

Readwise (`R`) already de-dupes server-side on exact
`title`/`author`/`text`/`source_url` match (confirmed via Readwise's API
docs), and our `createHighlight` call always sends the same fixed
title/author plus the note's own text/date — so a retried `R` call is
already a no-op today. No client change needed there.

## Non-goals

- No change to `PW` or `E` routing. Both are local file writes
  (`FileKVStorage` / `appendNoteToDoc`), not third-party APIs, and have no
  concept of a provider-side idempotency key. `PW`'s retry behavior
  (re-appending the same bullet on a rare double-run) and `E`'s
  (claims a fresh date rather than colliding) are both pre-existing,
  separate concerns from this doc.
- No change to `clients/readwise.ts` — see Summary above.
- No retry logic. This doc only makes an *accidental* retry (crash +
  re-run) safe; it does not add automatic retries anywhere calls don't
  already happen.
- No config toggle to disable this. It's strictly additive safety with no
  user-visible behavior change on the happy path, so there's nothing to
  make optional.

## Design

### `lib/idempotency.ts` (new)

A small, pure, dependency-free helper (`node:crypto` is built in, no new
package needed) that turns note content into a stable key:

```ts
import { createHash } from "node:crypto";

/**
 * Deterministic hex digest of the given parts, joined with a NUL separator
 * (so e.g. ["ab", "c"] and ["a", "bc"] can't collide). Same inputs always
 * produce the same output, so calling this again for the same note/tag on
 * a retry yields the same key the provider already saw.
 */
export function contentDigest(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

/**
 * Todoist's X-Request-Id must not exceed 36 bytes. Truncating a hex digest
 * to 36 characters is exactly 36 bytes (hex is pure ASCII) and still has
 * ~144 bits of input entropy going in — far more than enough to avoid
 * accidental collisions between unrelated notes.
 */
export function todoistRequestId(tag: string, date: string, text: string): string {
  return contentDigest([tag, date, text]).slice(0, 36);
}

/**
 * Resend allows up to 256 characters and recommends a readable
 * `<event-type>/<entity-id>` shape. We don't have a natural entity ID, so
 * we use a truncated content digest as the "entity" part.
 */
export function resendIdempotencyKey(date: string, text: string): string {
  return `notebook-email/${date}/${contentDigest(["W", date, text]).slice(0, 32)}`;
}
```

Keeping this in one file (rather than inlining hashing in each client)
means the Todoist-length-limit and Resend-shape decisions are documented
next to the code that encodes them, and both are unit-testable without
mocking `fetch`.

### `clients/todoist.ts`

Add an optional `idempotencyKey` to `CreateTaskParams` and send it as
`X-Request-Id` when present:

```ts
export interface CreateTaskParams {
  content: string;
  projectId?: string;
  dueDate?: string;
  /** Sent as X-Request-Id; Todoist discards a POST with a previously-seen ID. */
  idempotencyKey?: string;
}

async createTask(params: CreateTaskParams): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${this.apiToken}`,
    "Content-Type": "application/json",
  };
  if (params.idempotencyKey) {
    headers["X-Request-Id"] = params.idempotencyKey;
  }

  const res = await fetch(`${this.baseUrl}/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: params.content,
      project_id: params.projectId,
      due_date: params.dueDate,
    }),
  });

  if (!res.ok) {
    throw new Error(`Todoist API error (${res.status}): ${await res.text()}`);
  }
}
```

`idempotencyKey` stays optional (rather than required) so
`clients/todoist.test.ts`'s existing calls that don't care about this
don't need updating, and so the client itself doesn't take on an opinion
about how the key is derived — that's `router.ts`'s job.

### `clients/resend.ts`

Same shape, `Idempotency-Key` header:

```ts
export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  text: string;
  /** Sent as Idempotency-Key; Resend returns the original result instead of re-sending within 24h. */
  idempotencyKey?: string;
}

async sendEmail(params: SendEmailParams): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${this.apiKey}`,
    "Content-Type": "application/json",
  };
  if (params.idempotencyKey) {
    headers["Idempotency-Key"] = params.idempotencyKey;
  }

  const res = await fetch(`${this.baseUrl}/emails`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error (${res.status}): ${await res.text()}`);
  }
}
```

### `router.ts`

Compute the key at each call site, from the `Note` already in scope —
no new parameters needed on `routeNote` or `RouteDeps`:

```ts
import { todoistRequestId, resendIdempotencyKey } from "./lib/idempotency";

// ...

case "T":
  await deps.todoist.createTask({
    content: note.text,
    dueDate: todayIso(deps),
    idempotencyKey: todoistRequestId("T", note.date, note.text),
  });
  break;

case "I":
  await deps.todoist.createTask({
    content: note.text,
    projectId: deps.config.todoist.innerhelmProjectId,
    idempotencyKey: todoistRequestId("I", note.date, note.text),
  });
  break;

case "EQ":
  await deps.todoist.createTask({
    content: note.text,
    projectId: deps.config.todoist.eqpProjectId,
    idempotencyKey: todoistRequestId("EQ", note.date, note.text),
  });
  break;

// ...

case "W":
  await deps.resend.sendEmail({
    from: deps.config.resend.fromEmail,
    to: deps.config.resend.toEmail,
    subject: `Notebook entry — ${note.date}`,
    text: note.text,
    idempotencyKey: resendIdempotencyKey(note.date, note.text),
  });
  break;
```

The tag is included in the Todoist key (not just date + text) so that a
note tagged for more than one Todoist destination at once — e.g.
`[ ] I, [ ] EQ` on the same line with the same text — produces two
distinct keys and both tasks get created, rather than the second being
mistaken for a retry of the first.

Dry-run branches are untouched — they never call the real clients, so
there's nothing to key.

## Known limitation: identical duplicate notes

Because the key is derived purely from `tag` + `date` + `text`, two
*genuinely separate* notes on the same day, with the same tag and
word-for-word identical text, will hash to the same key — and the second
one's Todoist task or email will be silently discarded as a "duplicate"
by the provider, even though the user intended two distinct actions.

This is a pre-existing edge case made slightly worse, not introduced from
nothing: the checkbox mechanism already treats each occurrence
independently today (two separate checkboxes, two separate API calls), so
right now duplicate-content notes correctly produce two tasks. After this
change they'd produce one.

Given the source is a handwritten personal notebook, verbatim duplicate
entries on the same day are expected to be rare, so this doc proposes
accepting the risk rather than adding complexity to avoid it. If it turns
out to matter in practice, the fix is to fold something disambiguating
into the key (e.g. the note's line number at parse time), at the cost of
the key no longer being purely content-derived — worth a follow-up doc if
it comes up, not worth designing preemptively now.

## Testing

Following the existing per-module `vitest` convention:

- `lib/idempotency.test.ts` (new) — `contentDigest` is deterministic
  (same input → same output) and sensitive to each part (changing any one
  of tag/date/text changes the output); `todoistRequestId` output is
  always exactly 36 characters; `resendIdempotencyKey` output starts with
  `notebook-email/${date}/` and stays within 256 characters.
- `clients/todoist.test.ts` — new case asserting that when
  `idempotencyKey` is passed, the mocked `fetch` call's headers include
  `X-Request-Id` with that exact value; existing calls without it
  continue to assert no such header is sent.
- `clients/resend.test.ts` — same pattern for `Idempotency-Key`.
- `router.test.ts` — for each of `T`/`I`/`EQ`/`W`, assert the fake
  client's captured call args include an `idempotencyKey` computed the
  same way `lib/idempotency.ts` would (import the real helper in the test
  rather than re-deriving the hash by hand, so the test can't drift from
  the implementation); also add a case with two same-day/same-tag/
  same-text notes and assert they produce different... no — assert they
  produce the *same* key, to document the known limitation above as
  intentional rather than an oversight.

No changes needed to `runner.test.ts` or `config.test.ts` — this doesn't
touch `processFile`'s control flow or `AppConfig`'s shape.

## package.json changes

None. `node:crypto` is a Node/Bun built-in.

## Decisions

- **Key derivation**: SHA-256 of `tag|date|text` (NUL-joined), hex-encoded,
  truncated per-provider. Confirmed sufficient entropy for this use case;
  no need for a "proper" UUID format on the Todoist side since Todoist
  doesn't require the value to look like a UUID, just to be ≤36 bytes and
  unique per logical request.
- **Where the key is computed**: in `router.ts` at each call site, not
  inside the clients. Keeps the clients provider-shaped and dumb, keeps
  the hashing logic in one shared, independently-testable file.
- **Readwise**: no change. Confirmed via Readwise's API docs that
  `POST /highlights` already de-dupes on exact
  `title`/`author`/`text`/`source_url` match, which our fixed-title call
  already satisfies for retries.

## Open questions for Jules to flag back if unclear

None outstanding — flag anything that comes up during implementation.

## Out of scope / follow-ups (don't build now)

- Disambiguating genuinely-duplicate same-day/same-tag/same-text notes
  (see "Known limitation" above).
- Any change to the `PW`/`E` file-write paths.
- Surfacing the idempotency key in `--dry-run` log output — dry-run never
  calls the real clients, so there's nothing to show.
