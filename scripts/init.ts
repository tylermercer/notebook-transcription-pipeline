import { $ } from "bun";
import { existsSync, copyFileSync } from "node:fs";

const CF_TOKEN_URL = "https://dash.cloudflare.com/profile/api-tokens";

async function checkDependencies() {
  try {
    await $`pnpm --version`.quiet();
  } catch (e) {
    throw new Error(
      "pnpm is not installed. Please install it with 'npm install -g pnpm' or visit https://pnpm.io/installation"
    );
  }

  try {
    await $`gh --version`.quiet();
    await $`gh auth status`.quiet();
  } catch (e) {
    throw new Error(
      "GitHub CLI (gh) is not installed or not authenticated. Please run 'brew install gh' and 'gh auth login'."
    );
  }
}

async function main() {
  console.log("\n🚀 Starting Project Setup...\n");

  await checkDependencies();

  console.log(`\x1b[34m[1/3]\x1b[0m Installing dependencies...`);
  await $`pnpm install`;

  if (!existsSync(".env") && existsSync(".env.example")) {
    console.log("Creating .env from .env.example...");
    copyFileSync(".env.example", ".env");
  }

  console.log(`\x1b[34m[2/3]\x1b[0m Please create a Cloudflare API Token.`);
  console.log(`      Template: "Edit Cloudflare Workers"`);

  if (prompt("Press Enter to open the Cloudflare Dashboard (or 's' to skip):") !== "s") {
    try {
      await $`open ${CF_TOKEN_URL}`.quiet();
    } catch (e) {
      console.log(`Could not open browser automatically. Please visit: ${CF_TOKEN_URL}`);
    }
  }

  const cfToken = prompt("Paste your Cloudflare API Token:");
  const cfAccountId = prompt("Paste your Cloudflare Account ID:");

  if (!cfToken || !cfAccountId) throw new Error("Credentials are required.");

  console.log(`\x1b[34m[3/3]\x1b[0m Setting GitHub Secrets...`);
  await $`gh secret set CLOUDFLARE_API_TOKEN --body ${cfToken}`;
  await $`gh secret set CLOUDFLARE_ACCOUNT_ID --body ${cfAccountId}`;

  console.log(`\n\x1b[32m[Success]\x1b[0m Setup Complete!\n`);
}

main().catch((err) => {
  console.error(`\n\x1b[31m[Error]\x1b[0m ${err.message}`);
  process.exit(1);
});
