"use client";

import { useEffect } from "react";

export function CanonicalDomainGuard() {
  useEffect(() => {
    if (window.location.hostname !== "getascend.fit") return;
    window.location.replace(`https://www.getascend.fit${window.location.pathname}${window.location.search}${window.location.hash}`);
  }, []);

  return null;
}
