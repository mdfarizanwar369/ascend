import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it } from "vitest";
import { safeNotificationHref } from "@ascend/shared";
import { notificationLoginDestination, rememberNotificationLogin } from "./notificationNavigation";
const id="11111111-1111-4111-8111-111111111111";
afterEach(()=>sessionStorage.clear());
it("carries only a valid opaque reminder through login, once",()=>{
  rememberNotificationLogin(id); expect(notificationLoginDestination("/dashboard")).toBe(`/notifications/open?id=${id}`);
  expect(notificationLoginDestination("/dashboard")).toBe("/dashboard");
  rememberNotificationLogin("https://evil.test"); expect(notificationLoginDestination("/dashboard")).toBe("/dashboard");
});
it("drops expired and malformed login intents",()=>{
  sessionStorage.setItem("ascend.pending-notification.v1",JSON.stringify({id,at:Date.now()-16*60000}));
  expect(notificationLoginDestination("/dashboard")).toBe("/dashboard");
  sessionStorage.setItem("ascend.pending-notification.v1","bad json"); expect(notificationLoginDestination("/dashboard")).toBe("/dashboard");
});
it("service-worker clicks and foreground routing enforce the same destination allowlist",()=>{
  const sandbox: Record<string,unknown>={self:{addEventListener:()=>{}}};
  runInNewContext(readFileSync("public/sw.js","utf8"),sandbox);
  const worker=sandbox.notificationHref as (value:unknown)=>string;
  for(const href of [null,`/notifications/open?id=${id}`,"/food-log?meal=lunch","/workout-schedule","/journey","/coach","//evil.test","https://evil.test","/\\evil.test","/%2F%2Fevil","/notifications/open?id=bad","/admin"]) {
    expect(worker(href)).toBe(safeNotificationHref(href));
  }
});
