/**
 * Minimal key-value storage interface. Deliberately shaped to match the
 * Cloudflare Workers KV binding (`get`/`put`), so a Workers KVNamespace can
 * be used directly wherever a KVStorage is expected, and a D1-backed
 * implementation is a drop-in swap too.
 */
export interface KVStorage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/**
 * Bun/Node filesystem-backed KVStorage. Each key becomes `${folder}/${key}.md`.
 * This is the only piece of this module that's Bun/Node-specific — swap this
 * class out for a Cloudflare KV or D1 implementation later; nothing else
 * in the routing logic needs to change.
 */
export class FileKVStorage implements KVStorage {
  constructor(private readonly folder: string) {}

  private pathFor(key: string): string {
    return `${this.folder}/${key}.md`;
  }

  async get(key: string): Promise<string | null> {
    const file = Bun.file(this.pathFor(key));
    if (!(await file.exists())) return null;
    return await file.text();
  }

  async put(key: string, value: string): Promise<void> {
    await Bun.write(this.pathFor(key), value);
  }
}

/**
 * Appends a note's text as a bullet under a per-date markdown doc,
 * creating the doc (with a date header) if it doesn't exist yet.
 */
export async function appendNoteToDoc(
  storage: KVStorage,
  date: string,
  text: string,
): Promise<void> {
  const existing = await storage.get(date);
  const entry = `- ${text}\n`;
  const next = existing ? existing + entry : `# ${date}\n\n${entry}`;
  await storage.put(date, next);
}
