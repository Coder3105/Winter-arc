import { afterEach, describe, expect, it } from "vitest";

import { assertSameOriginRequest } from "@/server/http/same-origin";

const originalAppBaseUrl = process.env.APP_BASE_URL;

afterEach(() => {
  if (originalAppBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalAppBaseUrl;
});

describe("same-origin mutation validation", () => {
  it("accepts the exact request origin without extra configuration", () => {
    delete process.env.APP_BASE_URL;
    expect(() =>
      assertSameOriginRequest(
        new Request("http://local/api", { headers: { origin: "http://local" } }),
      ),
    ).not.toThrow();
  });

  it("accepts only the server-configured canonical origin across an internal URL rewrite", () => {
    process.env.APP_BASE_URL = "https://winter-arc.example/path";
    expect(() =>
      assertSameOriginRequest(
        new Request("http://localhost:3000/api", {
          headers: { origin: "https://winter-arc.example" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOriginRequest(
        new Request("http://localhost:3000/api", {
          headers: {
            origin: "https://evil.example",
            host: "evil.example",
            "x-forwarded-host": "evil.example",
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("rejects missing, malformed, and unconfigured foreign origins", () => {
    delete process.env.APP_BASE_URL;
    for (const request of [
      new Request("http://local/api"),
      new Request("http://local/api", { headers: { origin: "not a URL" } }),
      new Request("http://local/api", {
        headers: { origin: "https://evil.example" },
      }),
    ]) {
      expect(() => assertSameOriginRequest(request)).toThrow(
        expect.objectContaining({ code: "FORBIDDEN" }),
      );
    }
  });
});
