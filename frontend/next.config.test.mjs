import { describe, expect, it } from "vitest";

import nextConfig from "./next.config.mjs";

describe("frontend security headers", () => {
  it("allows the Firebase Google Auth script without allowing arbitrary HTTPS scripts", async () => {
    const rules = await nextConfig.headers();
    const applicationRule = rules.find((rule) => rule.source === "/:path((?!__).*)");
    const contentSecurityPolicy = applicationRule?.headers.find(
      (header) => header.key === "Content-Security-Policy"
    )?.value;

    const scriptDirective = contentSecurityPolicy
      ?.split("; ")
      .find((directive) => directive.startsWith("script-src "));

    expect(scriptDirective).toContain("https://apis.google.com");
    expect(scriptDirective?.split(" ")).not.toContain("https:");
  });
});
