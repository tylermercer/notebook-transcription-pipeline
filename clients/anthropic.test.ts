import { describe, expect, it } from "vitest";
import { AnthropicClient } from "./anthropic";
import type Anthropic from "@anthropic-ai/sdk";

describe("AnthropicClient", () => {
  it("streams and concatenates transcript chunks correctly", async () => {
    let capturedParams: any = null;

    async function* mockStream() {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "## 2025-06-29\n" } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "Transcribed note\n" } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "☐ PW" } };
    }

    const mockAnthropicSdk = {
      messages: {
        stream: (params: any) => {
          capturedParams = params;
          return mockStream();
        },
      },
    } as unknown as Anthropic;

    const client = new AnthropicClient(mockAnthropicSdk);
    const result = await client.transcribeImages({
      images: [
        { data: "base64data1", mediaType: "image/jpeg" },
        { data: "base64data2", mediaType: "image/png" },
      ],
      recentNotebookTail: "Tail context",
    });

    expect(result).toBe("## 2025-06-29\nTranscribed note\n☐ PW");
    expect(capturedParams.model).toBe("claude-sonnet-5");
    expect(capturedParams.messages[0].content).toHaveLength(3);
    expect(capturedParams.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", data: "base64data1", media_type: "image/jpeg" },
    });
    expect(capturedParams.messages[0].content[1]).toEqual({
      type: "image",
      source: { type: "base64", data: "base64data2", media_type: "image/png" },
    });
    expect(capturedParams.messages[0].content[2]).toEqual({
      type: "text",
      text: "Existing tail of notebook.md, for dedup reference:\n\nTail context",
    });
  });
});
