import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, RequestHandler } from "express";

// This is a restriction on the native iOS client, never an authentication grant.
// An iPhone browser or installed PWA has neither the native marker nor this header.
const editionContext = new AsyncLocalStorage<boolean>();
export const IOS_FREE_UNAVAILABLE = "This feature is not included in this version of Ascend. You can continue using the free tracking tools.";

export function isIosFreeRequest(req: Pick<Request, "get">) {
  return req.get("X-Ascend-Edition") === "ios-free-v1"
    || /\bAscendIOS\/\d+\b/.test(req.get("User-Agent") ?? "");
}

export function isIosFreeEdition() {
  return editionContext.getStore() === true;
}

export function withAppEdition<T>(iosFree: boolean, action: () => T): T {
  return editionContext.run(iosFree, action);
}

export const appEditionMiddleware: RequestHandler = (req, res, next) => {
  withAppEdition(isIosFreeRequest(req), () => {
    if (isIosFreeEdition()) {
      const path = req.path.replace(/\/+$/, "").toLowerCase();
      const restricted = /^\/(admin|founder|trainer|athlete|messages|reports|body-composition|missions)(\/|$)/.test(path) && path !== "/missions/today"
        || /^\/subscriptions(\/|$)/.test(path) && path !== "/subscriptions/me"
        || /^\/progress-photos(\/|$)/.test(path)
        || /^\/me\/coach-homework\//.test(path) && path !== "/me/coach-homework/current"
        || path === "/ai/workout";
      if (restricted) return res.status(403).json({ error: IOS_FREE_UNAVAILABLE, code: "IOS_FREE_EDITION" });
    }
    next();
  });
};
