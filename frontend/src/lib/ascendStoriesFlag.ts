"use client";

export function ascendStoriesEnabled() {
  return process.env.NEXT_PUBLIC_ASCEND_STORIES_V1 !== "false";
}
