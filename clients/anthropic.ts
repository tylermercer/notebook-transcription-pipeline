// Note: We use the official @anthropic-ai/sdk here instead of hand-rolled fetch
// to leverage SDK streaming and image handling helpers.
import Anthropic from "@anthropic-ai/sdk";

export interface TranscribeImagesParams {
  images: { data: string; mediaType: string }[]; // base64
  /** Tail of notebook.md, for dedup context (handles partial-page re-shoots) */
  recentNotebookTail: string;
}

const SYSTEM_PROMPT = `Read and transcribe handwritten text from the image(s) into this transcript format:
\`\`\`markdown
## YYYY-MM-DD
<note body>
☐ <tag1>, ☐ <tag2>
\`\`\`
Where the tags are one of R, PW, W, I, E, etc. Render the checkboxes as ☐ if they're unchecked and ☑ if they're checked.

You will also be given the tail end of the existing notebook.md file for context. Some or all of the content in the photographed page(s) may have already been transcribed there — this happens when a page is re-photographed after a partial capture. Compare the handwritten content against that existing tail and omit any note that's already present, so only genuinely new content is transcribed.`;

export class AnthropicClient {
  private readonly client: Anthropic;

  constructor(clientOrApiKey: string | Anthropic) {
    if (typeof clientOrApiKey === "string") {
      this.client = new Anthropic({ apiKey: clientOrApiKey });
    } else {
      this.client = clientOrApiKey;
    }
  }

  async transcribeImages(params: TranscribeImagesParams): Promise<string> {
    const stream = this.client.messages.stream({
      model: "claude-sonnet-5",
      max_tokens: 20000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...params.images.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, data: img.data, media_type: img.mediaType as any },
            })),
            {
              type: "text" as const,
              text: `Existing tail of notebook.md, for dedup reference:\n\n${params.recentNotebookTail}`,
            },
          ],
        },
      ],
    });

    let transcript = "";
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        transcript += chunk.delta.text;
      }
    }
    return transcript;
  }
}
