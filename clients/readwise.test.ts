import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadwiseClient } from "../readwise";

describe("ReadwiseClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends POST request to create highlight", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const client = new ReadwiseClient("test-rw-token");
    await client.createHighlight("Quote text", "2026-09-01");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://readwise.io/api/v2/highlights/",
      {
        method: "POST",
        headers: {
          Authorization: "Token test-rw-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          highlights: [
            {
              text: "Quote text",
              title: "Personal Notes",
              author: "Tyler Mercer",
              note: "Note date: 2026-09-01",
            },
          ],
        }),
      },
    );
  });

  it("throws error when API response is not ok", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("Bad Request", { status: 400 }),
    );

    const client = new ReadwiseClient("test-rw-token");

    await expect(
      client.createHighlight("Quote text", "2026-09-01"),
    ).rejects.toThrow("Readwise API error (400): Bad Request");
  });
});
