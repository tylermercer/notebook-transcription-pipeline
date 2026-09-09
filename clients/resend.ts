export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  text: string;
  /** Sent as Idempotency-Key; Resend returns the original result instead of re-sending within 24h. */
  idempotencyKey?: string;
}

export class ResendClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.resend.com",
  ) {}

  async sendEmail(params: SendEmailParams): Promise<void> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (params.idempotencyKey) {
      headers["Idempotency-Key"] = params.idempotencyKey;
    }

    const res = await fetch(`${this.baseUrl}/emails`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: params.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Resend API error (${res.status}): ${await res.text()}`,
      );
    }
  }
}
