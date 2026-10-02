import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { AppError } from "@/server/errors/app-error";

import type { EmailMessage, EmailProvider } from "./email-provider";

export class GmailEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(
    user: string,
    appPassword: string,
    private readonly from: string,
  ) {
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: appPassword },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      const result = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      if (Array.isArray(result.rejected) && result.rejected.length > 0) {
        throw new AppError("EMAIL_DELIVERY_FAILED");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("EMAIL_DELIVERY_FAILED");
    }
  }
}
