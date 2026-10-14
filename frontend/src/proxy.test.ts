import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("trainer invitation links", () => {
  it("sends already printed homepage QR links into signup with the code intact", () => {
    const request = new NextRequest("https://www.getascend.fit/?trainer=TRAINER-ZAHID", {
      headers: { host: "www.getascend.fit" }
    });
    const response = proxy(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.getascend.fit/login?trainer=TRAINER-ZAHID");
  });

  it("preserves trainer links through the apex domain redirect", () => {
    const request = new NextRequest("https://getascend.fit/?trainer=TRAINER-NELL", {
      headers: { host: "getascend.fit" }
    });
    const response = proxy(request);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://www.getascend.fit/?trainer=TRAINER-NELL");
  });
});
