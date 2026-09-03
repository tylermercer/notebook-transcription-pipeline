export interface AppConfig {
  todoist: {
    apiToken: string;
    innerhelmProjectId: string;
    eqpProjectId: string;
  };
  readwise: {
    apiToken: string;
  };
  resend: {
    apiKey: string;
    fromEmail: string;
    toEmail: string;
  };
  storage: {
    /** folder (or future KV/D1 namespace key prefix) for PW notes */
    pwFolder: string;
    /** folder (or future KV/D1 namespace key prefix) for E notes */
    eFolder: string;
  };
}

/**
 * Loads config from a plain string map. Works unchanged whether that map is
 * `process.env` (Bun) or the `env` object Cloudflare Workers passes into
 * the fetch handler — nothing here is Bun-specific.
 */
export interface LoadConfigOptions {
  /** If true, returns mock placeholders for missing required env vars instead of throwing. */
  allowMissing?: boolean;
}

export function loadConfig(
  env: Record<string, string | undefined>,
  options: LoadConfigOptions = {},
): AppConfig {
  const required = (key: string): string => {
    const value = env[key];
    if (!value) {
      if (options.allowMissing) {
        return `[DRY_RUN_MOCK_${key}]`;
      }
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  };

  return {
    todoist: {
      apiToken: required("TODOIST_API_TOKEN"),
      innerhelmProjectId: required("TODOIST_INNERHELM_PROJECT_ID"),
      eqpProjectId: required("TODOIST_EQP_PROJECT_ID"),
    },
    readwise: {
      apiToken: required("READWISE_API_TOKEN"),
    },
    resend: {
      apiKey: required("RESEND_API_KEY"),
      fromEmail: env.RESEND_FROM_EMAIL ?? "notebook@yourdomain.com",
      toEmail: env.NOTEBOOK_EMAIL_TO ?? "tmercer+notebook@lucidchart.com",
    },
    storage: {
      pwFolder: env.PW_FOLDER ?? "./notes/personal-writing",
      eFolder: env.E_FOLDER ?? "./notes/e",
    },
  };
}
