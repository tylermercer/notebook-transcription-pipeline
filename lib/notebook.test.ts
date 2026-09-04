import { describe, expect, it } from "vitest";
import { readNotebookTail, appendNotebookEntry } from "./notebook";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

describe("lib/notebook", () => {
  const testFile = "test-notebook-lib.md";

  it("reads notebook tail correctly", async () => {
    if (existsSync(testFile)) await unlink(testFile);
    await appendNotebookEntry(testFile, "Line 1\nLine 2\nLine 3\nLine 4");
    const tail = await readNotebookTail(testFile, 2);
    expect(tail).toBe("Line 3\nLine 4");
    if (existsSync(testFile)) await unlink(testFile);
  });

  it("appends notebook entry properly formatted", async () => {
    if (existsSync(testFile)) await unlink(testFile);
    await appendNotebookEntry(testFile, "Entry 1");
    await appendNotebookEntry(testFile, "Entry 2");
    const tail = await readNotebookTail(testFile, 10);
    expect(tail).toBe("Entry 1\nEntry 2");
    if (existsSync(testFile)) await unlink(testFile);
  });
});
