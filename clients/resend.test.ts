import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResendClient } from "../resend";

describe("ResendClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends POST request to send email", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 }),
    );

    const client = new ResendClient("test-resend-key");
    await client.sendEmail({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test Subject",
      text: "Email body content",
    });

    expect(mockFetch).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-resend-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Test Subject",
        text: "Email body content",
      }),
    });
  });

  it("throws error when API response is not ok", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    const client = new ResendClient("test-resend-key");

    await expect(
      client.sendEmail({
        from: "from@example.com",
        to: "to@example.com",
        subject: "Subject",
        text: "Body",
      }),
    ).rejects.toThrow("Resend API error (500): Internal Server Error");
  });
});
