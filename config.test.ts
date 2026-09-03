import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("config", () => {
  it("loads config correctly when all required env vars are provided", () => {
    const env = {
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

    const config = loadConfig(env);

    expect(config).toEqual({
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
        pwFolder: "./custom/pw",
        eFolder: "./custom/e",
      },
    });
  });

  it("uses default values for optional env vars", () => {
    const env = {
      TODOIST_API_TOKEN: "test-todoist-token",
      TODOIST_INNERHELM_PROJECT_ID: "proj-123",
      TODOIST_EQP_PROJECT_ID: "proj-456",
      READWISE_API_TOKEN: "test-readwise-token",
      RESEND_API_KEY: "test-resend-key",
    };

    const config = loadConfig(env);

    expect(config.resend.fromEmail).toBe("notebook@yourdomain.com");
    expect(config.resend.toEmail).toBe("tmercer+notebook@lucidchart.com");
    expect(config.storage.pwFolder).toBe("./notes/personal-writing");
    expect(config.storage.eFolder).toBe("./notes/e");
  });

  it("throws an error if a required env var is missing", () => {
    const env = {
      TODOIST_INNERHELM_PROJECT_ID: "proj-123",
      TODOIST_EQP_PROJECT_ID: "proj-456",
      READWISE_API_TOKEN: "test-readwise-token",
      RESEND_API_KEY: "test-resend-key",
    };

    expect(() => loadConfig(env)).toThrow("Missing required env var: TODOIST_API_TOKEN");
  });
});
