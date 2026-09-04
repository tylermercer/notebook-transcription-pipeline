import { validateNotebookContent } from "./validate";

export interface Env {
  GITHUB_TOKEN?: string;
  MCP_BEARER_TOKEN?: string;
  BEARER_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BASE_BRANCH?: string;
  NOTEBOOK_PATH?: string;
}

export interface AppendNotebookOptions {
  content: string;
  expectedSha: string;
  branchName?: string;
  prTitle?: string;
  prBody?: string;
}

export function getGitHubConfig(env: Env) {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN secret is not configured in Worker environment.");
  }
  return {
    token,
    owner: env.GITHUB_OWNER || "owner",
    repo: env.GITHUB_REPO || "notebook-router",
    baseBranch: env.GITHUB_BASE_BRANCH || "main",
    notebookPath: env.NOTEBOOK_PATH || "notebook.md",
  };
}

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "notebook-router-mcp",
    "Content-Type": "application/json",
  };
}

export async function getNotebookFile(env: Env, fetchImpl = fetch) {
  const config = getGitHubConfig(env);
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.notebookPath}?ref=${encodeURIComponent(config.baseBranch)}`;

  const res = await fetchImpl(url, {
    method: "GET",
    headers: getHeaders(config.token),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub API error getting notebook file (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { content?: string; sha?: string };
  if (!data.content || !data.sha) {
    throw new Error("Invalid response from GitHub contents API: missing content or sha.");
  }

  const cleanBase64 = data.content.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));
  const content = new TextDecoder().decode(bytes);

  return { content, sha: data.sha };
}

export async function getNotebookTail(env: Env, lineCount = 10, fetchImpl = fetch) {
  const file = await getNotebookFile(env, fetchImpl);
  const lines = file.content.split("\n");
  const tailLines = lines.slice(-lineCount);
  const tail = tailLines.join("\n");

  return {
    tail,
    sha: file.sha,
    totalLines: lines.length,
  };
}

export async function createBranch(env: Env, branchName: string, fetchImpl = fetch) {
  const config = getGitHubConfig(env);

  // 1. Get current commit sha of base branch
  const refUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.baseBranch)}`;
  const refRes = await fetchImpl(refUrl, {
    method: "GET",
    headers: getHeaders(config.token),
  });

  if (!refRes.ok) {
    const errorText = await refRes.text();
    throw new Error(`GitHub API error getting base branch ref (${refRes.status}): ${errorText}`);
  }

  const refData = (await refRes.json()) as { object?: { sha?: string } };
  const baseCommitSha = refData.object?.sha;
  if (!baseCommitSha) {
    throw new Error("Could not determine commit SHA for base branch.");
  }

  // 2. Create new branch reference
  const createRefUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/git/refs`;
  const createRes = await fetchImpl(createRefUrl, {
    method: "POST",
    headers: getHeaders(config.token),
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseCommitSha,
    }),
  });

  if (createRes.status === 422) {
    // Collision detected! Retry once with timestamp suffix
    const collisionBranchName = `${branchName}-${Date.now()}`;
    const retryRes = await fetchImpl(createRefUrl, {
      method: "POST",
      headers: getHeaders(config.token),
      body: JSON.stringify({
        ref: `refs/heads/${collisionBranchName}`,
        sha: baseCommitSha,
      }),
    });

    if (!retryRes.ok) {
      const errorText = await retryRes.text();
      throw new Error(`GitHub API error creating collision-retry branch (${retryRes.status}): ${errorText}`);
    }

    return {
      branchName: collisionBranchName,
      collided: true,
      originalBranchName: branchName,
    };
  }

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`GitHub API error creating branch (${createRes.status}): ${errorText}`);
  }

  return {
    branchName,
    collided: false,
    originalBranchName: branchName,
  };
}

export async function writeNotebookFile(
  env: Env,
  branchName: string,
  content: string,
  expectedSha: string,
  commitMessage: string,
  fetchImpl = fetch
) {
  const config = getGitHubConfig(env);
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.notebookPath}`;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binaryString += String.fromCharCode(byte);
    }
  }
  const base64Content = btoa(binaryString);

  const res = await fetchImpl(url, {
    method: "PUT",
    headers: getHeaders(config.token),
    body: JSON.stringify({
      message: commitMessage,
      content: base64Content,
      sha: expectedSha,
      branch: branchName,
    }),
  });

  if (res.status === 409 || res.status === 422) {
    const errorText = await res.text();
    throw new Error(
      `Stale SHA error: notebook.md on GitHub has changed since sha ${expectedSha} was read (${res.status}). Please re-fetch tail and retry. GitHub response: ${errorText}`
    );
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub API error writing notebook file (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { content?: { sha?: string } };
  return { sha: data.content?.sha };
}

export async function openPullRequest(
  env: Env,
  headBranch: string,
  title: string,
  body: string,
  fetchImpl = fetch
) {
  const config = getGitHubConfig(env);
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/pulls`;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: getHeaders(config.token),
    body: JSON.stringify({
      title,
      head: headBranch,
      base: config.baseBranch,
      body,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub API error opening pull request (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { html_url: string; number: number; title: string };
  return data;
}

export async function appendNotebookEntry(
  env: Env,
  options: AppendNotebookOptions,
  fetchImpl = fetch
) {
  // 1. Format validation check
  const validation = validateNotebookContent(options.content);
  if (!validation.valid) {
    throw new Error(`Format validation failed:\n- ${validation.errors.join("\n- ")}`);
  }

  // 2. Fetch current notebook file from base branch
  const currentFile = await getNotebookFile(env, fetchImpl);

  // 3. Sha-gating check against expectedSha
  if (currentFile.sha !== options.expectedSha) {
    throw new Error(
      `Stale SHA error: expected_sha '${options.expectedSha}' does not match current base branch sha '${currentFile.sha}'. Please call get_notebook_tail and retry.`
    );
  }

  // 4. Build updated full content for notebook.md
  let updatedContent = currentFile.content;
  if (updatedContent && !updatedContent.endsWith("\n\n")) {
    if (!updatedContent.endsWith("\n")) {
      updatedContent += "\n";
    }
    updatedContent += "\n";
  }
  updatedContent += options.content.trim() + "\n";

  // 5. Determine target branch name
  const defaultDateStr = new Date().toISOString().slice(0, 10);
  const desiredBranchName = options.branchName || `transcription/${defaultDateStr}`;

  // 6. Create branch (auto-resolving collision if needed)
  const branchInfo = await createBranch(env, desiredBranchName, fetchImpl);

  // 7. Write updated content to new branch with expectedSha
  const commitMsg = options.prTitle || `transcription: append notes ${defaultDateStr}`;
  await writeNotebookFile(
    env,
    branchInfo.branchName,
    updatedContent,
    options.expectedSha,
    commitMsg,
    fetchImpl
  );

  // 8. Prepare PR title and body
  const prTitle = options.prTitle || `transcription: append notes ${defaultDateStr}`;
  let prBody = options.prBody || "Appended transcribed notes to `notebook.md` via MCP server.";
  if (branchInfo.collided) {
    prBody += `\n\n*Note: Branch name collision occurred for '${branchInfo.originalBranchName}' and was auto-resolved to '${branchInfo.branchName}'.*`;
  }

  // 9. Open Pull Request
  const pr = await openPullRequest(env, branchInfo.branchName, prTitle, prBody, fetchImpl);

  return {
    success: true,
    prUrl: pr.html_url,
    prNumber: pr.number,
    branch: branchInfo.branchName,
    collided: branchInfo.collided,
  };
}
