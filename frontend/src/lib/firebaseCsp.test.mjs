import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function productionHeaders() {
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  const { default: config } = await import("../../next.config.mjs");
  return config.headers();
}

describe("Firebase browser authentication security policy", () => {
  it("allows Firebase's Google API loader without permitting arbitrary external scripts", async () => {
    const rules = await productionHeaders();
    const page = rules.find(rule => rule.source === "/:path((?!__).*)");
    const policy = page.headers.find(header => header.key === "Content-Security-Policy").value;
    const directives = new Map(policy.split(";").map(value => {
      const [name, ...sources] = value.trim().split(/\s+/);
      return [name, sources];
    }));
    const scriptSources = directives.get("script-src");
    const firebaseLoader = new URL("https://apis.google.com/js/api.js");

    expect(scriptSources).toContain(firebaseLoader.origin);
    expect(scriptSources).toContain("'self'");
    expect(scriptSources).not.toContain("https:");
    expect(scriptSources).not.toContain("*");
    expect(scriptSources).not.toContain("'unsafe-eval'");
    expect(scriptSources.filter(source => !source.startsWith("'"))).toEqual([firebaseLoader.origin]);

    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(directives.get("connect-src")).toEqual(["'self'", "https:", "wss:"]);
    expect(directives.get("frame-src")).toEqual(["'self'", "https://accounts.google.com", "https://*.firebaseapp.com"]);
    expect(directives.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(directives.has("upgrade-insecure-requests")).toBe(true);
  });

  it("retains the dedicated same-origin Firebase helper frame policy", async () => {
    const rules = await productionHeaders();
    const helper = rules.find(rule => rule.source === "/__/auth/:path*");
    expect(helper.headers).toContainEqual({ key: "X-Frame-Options", value: "SAMEORIGIN" });
    expect(helper.headers).not.toContainEqual(expect.objectContaining({ key: "Content-Security-Policy" }));
    const page = rules.find(rule => rule.source === "/:path((?!__).*)");
    expect(page.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
  });
});
