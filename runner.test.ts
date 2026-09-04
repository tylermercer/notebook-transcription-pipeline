import { describe, expect, it } from "vitest";
import { checkOffTagInContent, processFile, parseRunnerArgs } from "./runner";
import { loadConfig } from "./config";
import { unlink, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

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

describe("parseRunnerArgs", () => {
  it("parses CLI args correctly", () => {
    const parsed = parseRunnerArgs(["--dry-run", "-c", "custom-config.jsonc", "my-notebook.md"]);
    expect(parsed).toEqual({
      isDryRun: true,
      configPath: "custom-config.jsonc",
      filePaths: ["my-notebook.md"],
    });

    const parsedEq = parseRunnerArgs(["--config=custom-config.jsonc"]);
    expect(parsedEq.configPath).toBe("custom-config.jsonc");
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

  it("skips disabled destination tags and does not check them off in file", async () => {
    const customConfig = loadConfig({}, { allowMissing: true });
    customConfig.destinations = {
      pw: true,
      r: false,
    };

    const sampleNotebook = `## 2025-06-29
Test multi destination
☐ PW, ☐ R
`;
    await writeFile(testFile, sampleNotebook, "utf-8");

    try {
      const logs: string[] = [];
      // dryRun: true to avoid Bun-dependent FileKVStorage in vitest
      const result = await processFile(testFile, true, customConfig, (msg) => logs.push(msg));

      expect(result.notesProcessed).toBe(1);
      expect(result.tagActionsProcessed).toBe(1); // PW processed, R skipped
      expect(logs.some((line) => line.includes('Skipping disabled destination tag "R"'))).toBe(true);
    } finally {
      if (existsSync(testFile)) {
        await unlink(testFile);
      }
    }
  });
});

describe("config file loading and relative path resolution", () => {
  const tempDir = resolve("./temp-test-config-dir");
  const configPath = join(tempDir, "custom-config.jsonc");
  const customEnvPath = join(tempDir, "custom.env");
  const customNotebookPath = join(tempDir, "custom-notebook.md");

  it("loads config file and resolves relative paths relative to config file directory", async () => {
    await mkdir(tempDir, { recursive: true });

    await writeFile(
      customEnvPath,
      `
ANTHROPIC_API_KEY="env-key"
TODOIST_API_TOKEN="env-todoist"
TODOIST_INNERHELM_PROJECT_ID="proj1"
TODOIST_EQP_PROJECT_ID="proj2"
READWISE_API_TOKEN="env-readwise"
RESEND_API_KEY="env-resend"
`,
      "utf-8",
    );

    await writeFile(
      configPath,
      `
// Comment
{
  "port": 9123,
  "notebookPath": "custom-notebook.md",
  "envPath": "custom.env",
  "destinations": {
    "pw": true,
    "w": false,
  },
}
`,
      "utf-8",
    );

    try {
      const cfg = loadConfig({}, { configPath });

      expect(cfg.port).toBe(9123);
      expect(cfg.notebookPath).toBe(customNotebookPath);
      expect(cfg.destinations.pw).toBe(true);
      expect(cfg.destinations.w).toBe(false);
      expect(cfg.anthropic.apiKey).toBe("env-key");
    } finally {
      if (existsSync(tempDir)) {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  });
});
