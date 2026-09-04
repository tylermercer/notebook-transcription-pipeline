import { describe, expect, it } from "vitest";
import { checkOffTagInContent, processFile } from "./runner";
import { loadConfig } from "./config";
import { unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

describe("checkOffTagInContent", () => {
  it("replaces first unprocessed tag with checked tag", () => {
    const input = `
## 2025-06-29
Note text
☐ PW, ☐ R
`;
    const result = checkOffTagInContent(input, "PW");
    expect(result).toBe(`
## 2025-06-29
Note text
☑ PW, ☐ R
`);
  });

  it("leaves already checked tags alone and targets first unchecked tag", () => {
    const input = `
## 2025-06-29
Note text
☑ PW, ☐ R
`;
    const result = checkOffTagInContent(input, "R");
    expect(result).toBe(`
## 2025-06-29
Note text
☑ PW, ☑ R
`);
  });

  it("handles tags without space after checkbox e.g. ☐PW", () => {
    const input = `
## 2025-06-29
Note text
☐PW, ☐R
`;
    const result = checkOffTagInContent(input, "PW");
    expect(result).toBe(`
## 2025-06-29
Note text
☑ PW, ☐R
`);
  });
});

describe("processFile", () => {
  const testFile = "test-notebook-runner.md";
  const config = loadConfig({}, { allowMissing: true });

  it("returns summary and logs when dry run is executed", async () => {
    const sampleNotebook = `## 2025-06-29
Test dry run note
☐ T
`;
    await writeFile(testFile, sampleNotebook, "utf-8");

    try {
      const logs: string[] = [];
      const result = await processFile(testFile, true, config, (msg) => logs.push(msg));

      expect(result.notesProcessed).toBe(1);
      expect(result.tagActionsProcessed).toBe(1);
      expect(result.logLines.length).toBeGreaterThan(0);
      expect(logs).toEqual(result.logLines);
      expect(result.logLines.some((line) => line.includes("[DRY RUN] [T]"))).toBe(true);
    } finally {
      if (existsSync(testFile)) {
        await unlink(testFile);
      }
    }
  });

  it("handles missing files gracefully", async () => {
    const result = await processFile("non-existent-file.md", true, config, () => {});
    expect(result.notesProcessed).toBe(0);
    expect(result.tagActionsProcessed).toBe(0);
    expect(result.logLines[0]).toContain("File not found");
  });
});
