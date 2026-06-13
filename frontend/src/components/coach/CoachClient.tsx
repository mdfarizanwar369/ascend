"use client";

import { FormEvent, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { sendCoachMessage } from "@/lib/ascendApi";

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
};

const starterMessages: ChatMessage[] = [
  {
    role: "assistant",
    text: "Tell me what you ate today or what you are about to eat. I will keep it practical and fit it to your goal."
  }
];

export function CoachClient() {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    setMessage("");
    setStatus("");
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", text: trimmed }]);

    try {
      const response = await sendCoachMessage(trimmed);
      setMessages((current) => [...current, { role: "assistant", text: response.reply }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            "The coach is having a short connection issue. For now, make the next choice simple: pick one protein source, add fruit or vegetables if you can, and keep the portion comfortable. Try sending your question again in a minute."
        }
      ]);
      setStatus(error instanceof Error ? error.message : "AI coach is temporarily busy.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-calm text-ink">
            <Sparkles size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">AI nutrition coach</h1>
            <p className="text-xs text-zinc-400">Malaysia and Singapore food aware</p>
          </div>
        </header>

        {status ? <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-amber">{status}</p> : null}

        <section className="flex-1 space-y-3 py-4">
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`max-w-[86%] rounded-lg p-3 text-sm leading-6 ${
                item.role === "user" ? "ml-auto bg-lime text-ink" : "bg-surface text-zinc-200"
              }`}
            >
              {item.text}
            </div>
          ))}
          {isSending ? <p className="rounded-lg bg-surface p-3 text-sm text-zinc-400">Coach is thinking...</p> : null}
        </section>

        <form className="sticky bottom-0 flex gap-2 bg-ink pb-4 pt-2" onSubmit={handleSubmit}>
          <input
            className="h-12 flex-1 rounded-lg border border-line bg-surface px-3 outline-none focus:border-lime"
            placeholder="Ask about your next meal"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button
            type="submit"
            disabled={isSending || !message.trim()}
            className="grid h-12 w-12 place-items-center rounded-lg bg-lime text-ink disabled:opacity-60"
            aria-label="Send message"
          >
            <Send size={19} />
          </button>
        </form>
      </div>
    </main>
  );
}
