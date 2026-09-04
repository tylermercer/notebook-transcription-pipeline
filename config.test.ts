import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  loadConfig,
  parseJsonc,
  parseEnvFile,
  stripJsoncCommentsAndTrailingCommas,
  isDestinationEnabled,
} from "./config";

describe("config", () => {
  it("parses JSONC content with comments and trailing commas", () => {
    const jsonc = `
    // Configuration file
    {
      /* Port number */
      "port": 9000,
      "notebookPath": "my-notebook.md",
      "destinations": {
        "pw": false, // disable PW
        "t": true,
      },
    }
    `;
    const parsed = parseJsonc(jsonc);
    expect(parsed).toEqual({
      port: 9000,
      notebookPath: "my-notebook.md",
      destinations: {
        pw: false,
        t: true,
      },
    });
  });

  it("parses .env file content", () => {
    const envContent = `
# Comment
ANTHROPIC_API_KEY="key123"
TODOIST_API_TOKEN='token456'
PLAIN_VAL=hello
`;
    const envMap = parseEnvFile(envContent);
    expect(envMap).toEqual({
      ANTHROPIC_API_KEY: "key123",
      TODOIST_API_TOKEN: "token456",
      PLAIN_VAL: "hello",
    });
  });

  it("loads config correctly when all required env vars are provided", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      TODOIST_API_TOKEN: "test-todoist-token",
      TODOIST_INNERHELM_PROJECT_ID: "proj-123",
      TODOIST_EQP_PROJECT_ID: "proj-456",
      READWISE_API_TOKEN: "test-readwise-token",
      RESEND_API_KEY: "test-resend-key",
      RESEND_FROM_EMAIL: "custom-from@example.com",
      NOTEBOOK_EMAIL_TO: "custom-to@example.com",
      PW_FOLDER: "./custom/pw",
      E_FOLDER: "./custom/e",
    };

    const cwd = process.cwd();
    const config = loadConfig(env, { scriptDir: cwd });

    expect(config).toEqual({
      port: 8000,
      notebookPath: resolve(cwd, "notebook.md"),
      configPath: undefined,
      destinations: {
        pw: true,
        e: true,
        t: true,
        i: true,
        eq: true,
        r: true,
        w: true,
      },
      anthropic: {
        apiKey: "test-anthropic-key",
      },
      todoist: {
        apiToken: "test-todoist-token",
        innerhelmProjectId: "proj-123",
        eqpProjectId: "proj-456",
      },
      readwise: {
        apiToken: "test-readwise-token",
      },
      resend: {
        apiKey: "test-resend-key",
        fromEmail: "custom-from@example.com",
        toEmail: "custom-to@example.com",
      },
      storage: {
        pwFolder: resolve(cwd, "./custom/pw"),
        eFolder: resolve(cwd, "./custom/e"),
      },
    });
  });

  it("uses default values for optional env vars", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      TODOIST_API_TOKEN: "test-todoist-token",
      TODOIST_INNERHELM_PROJECT_ID: "proj-123",
      TODOIST_EQP_PROJECT_ID: "proj-456",
      READWISE_API_TOKEN: "test-readwise-token",
      RESEND_API_KEY: "test-resend-key",
    };

    const cwd = process.cwd();
    const config = loadConfig(env, { scriptDir: cwd });

    expect(config.resend.fromEmail).toBe("notebook@yourdomain.com");
    expect(config.resend.toEmail).toBe("tmercer+notebook@lucidchart.com");
    expect(config.storage.pwFolder).toBe(resolve(cwd, "./notes/personal-writing"));
    expect(config.storage.eFolder).toBe(resolve(cwd, "./notes/e"));
  });

  it("throws an error if a required env var is missing", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-anthropic-key",
      TODOIST_INNERHELM_PROJECT_ID: "proj-123",
      TODOIST_EQP_PROJECT_ID: "proj-456",
      READWISE_API_TOKEN: "test-readwise-token",
      RESEND_API_KEY: "test-resend-key",
    };

    expect(() => loadConfig(env)).toThrow("Missing required env var: TODOIST_API_TOKEN");
  });

  it("returns mock strings for missing env vars when allowMissing is true", () => {
    const env = {};
    const config = loadConfig(env, { allowMissing: true });

    expect(config.anthropic.apiKey).toBe("[DRY_RUN_MOCK_ANTHROPIC_API_KEY]");
    expect(config.todoist.apiToken).toBe("[DRY_RUN_MOCK_TODOIST_API_TOKEN]");
    expect(config.readwise.apiToken).toBe("[DRY_RUN_MOCK_READWISE_API_TOKEN]");
    expect(config.resend.apiKey).toBe("[DRY_RUN_MOCK_RESEND_API_KEY]");
  });

  it("correctly identifies enabled/disabled destinations", () => {
    const config = loadConfig(
      {
        ANTHROPIC_API_KEY: "a",
        TODOIST_API_TOKEN: "b",
        TODOIST_INNERHELM_PROJECT_ID: "c",
        TODOIST_EQP_PROJECT_ID: "d",
        READWISE_API_TOKEN: "e",
        RESEND_API_KEY: "f",
      },
      { allowMissing: true },
    );
    config.destinations = {
      pw: true,
      t: false,
    };

    expect(isDestinationEnabled(config, "PW")).toBe(true);
    expect(isDestinationEnabled(config, "T")).toBe(false);
    expect(isDestinationEnabled(config, "R")).toBe(true); // default true when unmentioned
  });
});
