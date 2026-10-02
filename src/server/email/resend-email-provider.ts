import "server-only";

import { Resend } from "resend";

import { AppError } from "@/server/errors/app-error";

import type { EmailMessage, EmailProvider } from "./email-provider";

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      const result = await this.client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      if (result.error || !result.data) throw new AppError("EMAIL_DELIVERY_FAILED");
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("EMAIL_DELIVERY_FAILED");
    }
  }
}
