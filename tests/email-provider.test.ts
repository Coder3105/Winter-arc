import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  createTransport: vi.fn(),
  gmailSend: vi.fn(),
  resendConstructor: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({ getServerEnvironment: mocks.environment }));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));
vi.mock("resend", () => ({
  Resend: class {
    readonly emails = { send: mocks.resendSend };

    constructor(apiKey: string) {
      mocks.resendConstructor(apiKey);
    }
  },
}));

import { createEmailProvider, getOtpPepper } from "@/server/email/email-provider";

const message = {
  to: "user@example.test",
  subject: "Winter Arc — Login Request",
  html: "<p>body</p>",
  text: "body",
};

describe("email provider boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.mockReturnValue({
      EMAIL_PROVIDER: "gmail",
      GMAIL_USER: "mailer@example.test",
      GMAIL_APP_PASSWORD: "synthetic-app-password",
      EMAIL_FROM: "Winter Arc <system@example.test>",
      OTP_PEPPER: "synthetic-test-pepper-that-is-long-enough",
    });
    mocks.gmailSend.mockResolvedValue({ accepted: [message.to], rejected: [] });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.gmailSend });
    mocks.resendSend.mockResolvedValue({ data: { id: "email-id" }, error: null });
  });

  it("selects Gmail SMTP and never constructs Resend in Gmail mode", async () => {
    await expect(createEmailProvider().send(message)).resolves.toBeUndefined();

    expect(mocks.createTransport).toHaveBeenCalledExactlyOnceWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "mailer@example.test",
        pass: "synthetic-app-password",
      },
    });
    expect(mocks.gmailSend).toHaveBeenCalledExactlyOnceWith({
      from: "Winter Arc <system@example.test>",
      ...message,
    });
    expect(mocks.resendConstructor).not.toHaveBeenCalled();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it.each([
    { GMAIL_USER: undefined },
    { GMAIL_APP_PASSWORD: undefined },
    { EMAIL_FROM: undefined },
  ])("fails closed when Gmail credentials are incomplete", (missing) => {
    mocks.environment.mockReturnValue({
      EMAIL_PROVIDER: "gmail",
      GMAIL_USER: "mailer@example.test",
      GMAIL_APP_PASSWORD: "synthetic-app-password",
      EMAIL_FROM: "Winter Arc <system@example.test>",
      ...missing,
    });

    expect(() => createEmailProvider()).toThrow(
      expect.objectContaining({ code: "EMAIL_NOT_CONFIGURED" }),
    );
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.resendConstructor).not.toHaveBeenCalled();
  });

  it("sanitizes Gmail SMTP failures", async () => {
    mocks.gmailSend.mockRejectedValue(new Error("private SMTP diagnostic"));
    await expect(createEmailProvider().send(message)).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_FAILED",
      message: "The authentication email could not be delivered.",
    });
  });

  it("keeps the isolated Resend adapter available only when selected", async () => {
    mocks.environment.mockReturnValue({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "synthetic-api-key",
      EMAIL_FROM: "Winter Arc <system@example.test>",
      APP_BASE_URL: "http://127.0.0.1:4321",
    });

    await expect(createEmailProvider().send(message)).resolves.toBeUndefined();
    expect(mocks.resendConstructor).toHaveBeenCalledWith("synthetic-api-key");
    expect(mocks.resendSend).toHaveBeenCalledWith({
      from: "Winter Arc <system@example.test>",
      ...message,
    });
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("retains the independent OTP pepper boundary", () => {
    expect(getOtpPepper()).toBe("synthetic-test-pepper-that-is-long-enough");
    mocks.environment.mockReturnValue({});
    expect(() => getOtpPepper()).toThrow(
      expect.objectContaining({ code: "OTP_NOT_CONFIGURED" }),
    );
  });
});
