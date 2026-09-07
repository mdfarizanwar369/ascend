import { messages } from "./messages";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => String(values[key] ?? match));
}

export const englishMessage: Translate = (key, values) => interpolate(messages.en[key] ?? key, values);
