import type { AscendStoryFormat, AscendStoryStyle } from "@/lib/ascendStories";

export type AscendStoryAnalyticsEvent =
  | "ascend_story_opened"
  | "ascend_story_format_selected"
  | "ascend_story_style_selected"
  | "ascend_story_preview_generated"
  | "ascend_story_share_sheet_opened"
  | "ascend_story_image_saved"
  | "ascend_story_generation_failed"
  | "ascend_story_share_failed";

export function sanitizeAscendStoryAnalyticsProperties(properties: Record<string, unknown>) {
  const safe: { format?: AscendStoryFormat; style?: AscendStoryStyle; platform?: "native" | "web" } = {};
  if (["today", "then-now", "earned"].includes(String(properties.format))) safe.format = properties.format as AscendStoryFormat;
  if (["loud", "cinematic", "quiet"].includes(String(properties.style))) safe.style = properties.style as AscendStoryStyle;
  if (["native", "web"].includes(String(properties.platform))) safe.platform = properties.platform as "native" | "web";
  return safe;
}

export function recordAscendStoryEvent(
  event: AscendStoryAnalyticsEvent,
  properties: { format?: AscendStoryFormat; style?: AscendStoryStyle; platform?: "native" | "web" } = {}
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ascend:analytics", { detail: { event, ...sanitizeAscendStoryAnalyticsProperties(properties) } }));
}
