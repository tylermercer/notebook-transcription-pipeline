export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export class ResendClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.resend.com",
  ) {}

  async sendEmail(params: SendEmailParams): Promise<void> {
    const res = await fetch(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(
        `Resend API error (${res.status}): ${await res.text()}`,
      );
    }
  }
}
