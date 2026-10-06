import express from "express";
import { AddressInfo } from "node:net";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(() => ({ issue:vi.fn(),revoke:vi.fn(),find:vi.fn() }));
vi.mock("../middleware/auth",() => ({
  requireAuth:(req:any,_res:any,next:() => void) => { req.user={ id:"member-id",email:"member@example.com",isPlatformOwner:false }; next(); },
  parseBearerToken:vi.fn()
}));
vi.mock("../middleware/rateLimits",() => ({ siriSessionRateLimit:(_req:any,_res:any,next:() => void) => next() }));
vi.mock("../services/siriSessionService",() => ({
  issueSiriSession:mocks.issue, revokeSiriSession:mocks.revoke, findSiriSessionUser:mocks.find
}));
vi.mock("../services/voiceTodayService",() => ({ getVoiceTodayData:vi.fn(),voiceTodayQuery:{ parse:(value:unknown) => value } }));
vi.mock("../services/voiceQuestionService",() => ({ getVoiceQuestionData:vi.fn(),voiceQuestionQuery:{ parse:(value:unknown) => value } }));

describe("public Siri session provisioning",() => {
  let base="";
  let close:() => Promise<void>;

  beforeAll(async () => {
    mocks.issue.mockResolvedValue({ token:`ascs_${"A".repeat(43)}`,expiresAt:"2026-11-01T00:00:00.000Z" });
    const { siriRouter }=await import("../routes/siri");
    const app=express(); app.use(express.json()); app.use(siriRouter);
    const server=app.listen(0);
    await new Promise<void>(resolve => server.once("listening",resolve));
    base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close=() => new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  });
  afterAll(async () => close?.());

  it("provisions a signed-in member without requiring owner status",async () => {
    const response=await fetch(`${base}/me/siri/connect`,{ method:"POST" });
    expect(response.status).toBe(200);
    expect(mocks.issue).toHaveBeenCalledWith("member-id");
    expect(await response.json()).toEqual(expect.objectContaining({ token:expect.stringMatching(/^ascs_/) }));
  });
});
