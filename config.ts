import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DestinationsConfig, RawConfigFile } from "./types";

export interface AppConfig {
  port: number;
  notebookPath: string;
  destinations: DestinationsConfig;
  configPath?: string;
  anthropic: {
    apiKey: string;
  };
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
 * Strips comments (// and /* ... *\/) and trailing commas from a JSONC string
 * so it can be safely parsed by JSON.parse.
 */
export function stripJsoncCommentsAndTrailingCommas(jsoncStr: string): string {
  let insideString = false;
  let inSingleComment = false;
  let inBlockComment = false;
  let result = "";

  for (let i = 0; i < jsoncStr.length; i++) {
    const char = jsoncStr[i];
    const nextChar = jsoncStr[i + 1];

    if (inSingleComment) {
      if (char === "\n" || char === "\r") {
        inSingleComment = false;
        result += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        i++; // Skip '/'
      }
      continue;
    }

    if (insideString) {
      result += char;
      if (char === "\\" && nextChar) {
        result += nextChar;
        i++;
      } else if (char === '"') {
        insideString = false;
      }
      continue;
    }

    if (char === '"') {
      insideString = true;
      result += char;
      continue;
    }

    if (char === "/" && nextChar === "/") {
      inSingleComment = true;
      i++;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    result += char;
  }

  // Remove trailing commas before ] or }
  result = result.replace(/,\s*([\]}])/g, "$1");

  return result;
}

export function parseJsonc<T = any>(jsoncStr: string): T {
  const clean = stripJsoncCommentsAndTrailingCommas(jsoncStr);
  return JSON.parse(clean);
}

/**
 * Simple .env file parser. Supports lines with KEY=VALUE, single/double quotes, and comments.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (key) {
      env[key] = val;
    }
  }

  return env;
}

export interface LoadConfigOptions {
  /** If true, returns mock placeholders for missing required env vars instead of throwing. */
  allowMissing?: boolean;
  /** Explicit config file path supplied via CLI or caller. */
  configPath?: string;
  /** Base directory for script execution / auto-detection defaults. Defaults to process.cwd() or import.meta.dir. */
  scriptDir?: string;
}

/**
 * Finds JSONC config file path if available.
 * 1. Specified options.configPath
 * 2. Auto-detect config.jsonc or config.json in scriptDir
 */
export function findConfigFile(options: LoadConfigOptions = {}): string | undefined {
  if (options.configPath) {
    return resolve(options.configPath);
  }

  const scriptDir = options.scriptDir || process.cwd();
  const jsoncCandidate = resolve(scriptDir, "config.jsonc");
  if (existsSync(jsoncCandidate)) return jsoncCandidate;

  const jsonCandidate = resolve(scriptDir, "config.json");
  if (existsSync(jsonCandidate)) return jsonCandidate;

  return undefined;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  options: LoadConfigOptions = {},
): AppConfig {
  const configFile = findConfigFile(options);
  let rawConfig: RawConfigFile = {};
  let configDir = options.scriptDir || process.cwd();

  if (configFile) {
    configDir = dirname(configFile);
    try {
      const content = readFileSync(configFile, "utf-8");
      rawConfig = parseJsonc<RawConfigFile>(content);
    } catch (err: any) {
      throw new Error(`Failed to parse config file at ${configFile}: ${err.message}`);
    }
  }

  // Parse .env if specified in rawConfig or default .env relative to configDir
  const mergedEnv: Record<string, string | undefined> = { ...env };

  const envPath = rawConfig.envPath
    ? resolve(configDir, rawConfig.envPath)
    : resolve(configDir, ".env");

  if (existsSync(envPath)) {
    try {
      const envContent = readFileSync(envPath, "utf-8");
      const parsedEnv = parseEnvFile(envContent);
      for (const [k, v] of Object.entries(parsedEnv)) {
        if (mergedEnv[k] === undefined) {
          mergedEnv[k] = v;
        }
      }
    } catch (err: any) {
      // Ignore or log error reading env file
    }
  }

  const required = (key: string): string => {
    const value = mergedEnv[key];
    if (!value) {
      if (options.allowMissing) {
        return `[DRY_RUN_MOCK_${key}]`;
      }
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  };

  const defaultNotebookPath = resolve(configDir, "notebook.md");
  const notebookPath = rawConfig.notebookPath
    ? resolve(configDir, rawConfig.notebookPath)
    : (mergedEnv.NOTEBOOK_FILE ? resolve(configDir, mergedEnv.NOTEBOOK_FILE) : defaultNotebookPath);

  const defaultPwFolder = resolve(configDir, "./notes/personal-writing");
  const pwFolder = rawConfig.pwFolder
    ? resolve(configDir, rawConfig.pwFolder)
    : (mergedEnv.PW_FOLDER ? resolve(configDir, mergedEnv.PW_FOLDER) : defaultPwFolder);

  const defaultEFolder = resolve(configDir, "./notes/e");
  const eFolder = rawConfig.eFolder
    ? resolve(configDir, rawConfig.eFolder)
    : (mergedEnv.E_FOLDER ? resolve(configDir, mergedEnv.E_FOLDER) : defaultEFolder);

  const port = rawConfig.port ?? (mergedEnv.PORT ? parseInt(mergedEnv.PORT, 10) : 8000);

  const defaultDestinations: DestinationsConfig = {
    pw: true,
    e: true,
    t: true,
    i: true,
    eq: true,
    r: true,
    w: true,
  };

  const destinations: DestinationsConfig = {
    ...defaultDestinations,
    ...rawConfig.destinations,
  };

  return {
    port,
    notebookPath,
    destinations,
    configPath: configFile,
    anthropic: {
      apiKey: required("ANTHROPIC_API_KEY"),
    },
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
      fromEmail: mergedEnv.RESEND_FROM_EMAIL ?? "notebook@yourdomain.com",
      toEmail: mergedEnv.NOTEBOOK_EMAIL_TO ?? "tmercer+notebook@lucidchart.com",
    },
    storage: {
      pwFolder,
      eFolder,
    },
  };
}

/**
 * Checks whether a given destination tag (e.g. "PW", "T", "R", etc.) is enabled in config.
 */
export function isDestinationEnabled(config: AppConfig, tag: string): boolean {
  if (!config || !config.destinations) return true;
  const key = tag.toLowerCase();
  const enabled = config.destinations[key];
  return enabled !== false;
}
