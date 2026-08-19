"use client";

export function ascendStoriesEnabled() {
  if (process.env.NEXT_PUBLIC_ASCEND_STORIES_V1 === "true") return true;
  return process.env.NODE_ENV !== "production";
}
