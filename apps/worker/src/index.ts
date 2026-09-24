export interface Env {
  DB: D1Database;
  WEBHOOK_AUTH_TOKEN?: string;
  TYPESAFE_API_KEY?: string;
}

export const KNOWN_TAGS = ["PW", "E", "T", "I", "EQ", "R", "W"] as const;

export interface JevSystemOneResponse {
  model?: string;
  answers?: Record<
    string,
    {
      type?: string;
      noul?: number;
      choice?: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    }
  >;
}

export async function categorizeTextWithJev(
  text: string,
  typesafeApiKey: string,
): Promise<string[]> {
  if (!typesafeApiKey) {
    throw new Error("Missing TYPESAFE_API_KEY for Jev AI classification");
  }

  // Define questions for Jev System One API
  const questions = {
    tag_pw: {
      type: "noul",
      instructions: "Is this note personal journal writing or personal reflections to be archived?",
    },
    tag_e: {
      type: "noul",
      instructions: "Is this a sequential daily note or timestamped essay/entry?",
    },
    tag_t: {
      type: "noul",
      instructions: "Is this an actionable task or to-do item for the main Todoist inbox?",
    },
    tag_i: {
      type: "noul",
      instructions: "Is this a task or idea specifically related to writing or the Innerhelm project?",
    },
    tag_eq: {
      type: "noul",
      instructions: "Is this a task or issue related to EQP or equipment/projects?",
    },
    tag_r: {
      type: "noul",
      instructions: "Is this a quote, book highlight, reading note, or excerpt for Readwise?",
    },
    tag_w: {
      type: "noul",
      instructions: "Is this a note intended to be sent via email?",
    },
  };

  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${typesafeApiKey}`,
    },
    body: JSON.stringify({
      state: text,
      model: "jev-latest",
      questions,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Jev AI API error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as JevSystemOneResponse;
  const selectedTags: string[] = [];

  const answers = data.answers || {};
  if (answers.tag_pw?.noul !== undefined && answers.tag_pw.noul >= 0.5) selectedTags.push("PW");
  if (answers.tag_e?.noul !== undefined && answers.tag_e.noul >= 0.5) selectedTags.push("E");
  if (answers.tag_t?.noul !== undefined && answers.tag_t.noul >= 0.5) selectedTags.push("T");
  if (answers.tag_i?.noul !== undefined && answers.tag_i.noul >= 0.5) selectedTags.push("I");
  if (answers.tag_eq?.noul !== undefined && answers.tag_eq.noul >= 0.5) selectedTags.push("EQ");
  if (answers.tag_r?.noul !== undefined && answers.tag_r.noul >= 0.5) selectedTags.push("R");
  if (answers.tag_w?.noul !== undefined && answers.tag_w.noul >= 0.5) selectedTags.push("W");

  // If no tag scored >= 0.5, default to PW
  if (selectedTags.length === 0) {
    selectedTags.push("PW");
  }

  return selectedTags;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/ingest") {
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check Bearer Token Auth
    const authHeader = request.headers.get("Authorization");
    const expectedToken = env.WEBHOOK_AUTH_TOKEN;

    if (expectedToken) {
      if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.slice(7).trim() !== expectedToken) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    try {
      let rawText = "";
      const contentType = request.headers.get("Content-Type") || "";

      if (contentType.includes("application/json")) {
        const json = (await request.json()) as { text?: string };
        rawText = json.text || "";
      } else {
        rawText = await request.text();
      }

      rawText = rawText.trim();
      if (!rawText) {
        return new Response(JSON.stringify({ error: "Empty or missing text body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Categorize text using Jev AI
      const typesafeApiKey = env.TYPESAFE_API_KEY || "";
      let tags: string[] = [];
      if (typesafeApiKey) {
        tags = await categorizeTextWithJev(rawText, typesafeApiKey);
      } else {
        // Fallback default tag if key is not configured in local/dev worker environment
        tags = ["PW"];
      }

      const id = crypto.randomUUID();
      const todayDate = new Date().toISOString().split("T")[0]!;
      const createdAt = new Date().toISOString();
      const tagsJson = JSON.stringify(tags);
      const completedTagsJson = JSON.stringify([]);

      // Insert into D1
      await env.DB.prepare(
        `INSERT INTO notes (id, date, text, tags, completed_tags, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(id, todayDate, rawText, tagsJson, completedTagsJson, createdAt)
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          id,
          date: todayDate,
          text: rawText,
          tags,
          completed_tags: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message || "Internal Server Error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
