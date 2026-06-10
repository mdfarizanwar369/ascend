import { Send, Sparkles } from "lucide-react";

const messages = [
  { role: "assistant", text: "Your protein is a little low today. Dinner is a good place to recover it." },
  { role: "user", text: "Can I eat chicken rice tonight?" },
  {
    role: "assistant",
    text: "Yes. Choose roasted or steamed chicken, keep rice to one fist-sized portion, and skip sweet drinks if fat loss is the goal."
  }
];

export default function CoachPage() {
  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <header className="flex items-center gap-3 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-calm text-ink">
            <Sparkles size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">AI nutrition coach</h1>
            <p className="text-xs text-zinc-400">Malaysia and Singapore food aware</p>
          </div>
        </header>

        <section className="flex-1 space-y-3 py-4">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[86%] rounded-lg p-3 text-sm leading-6 ${
                message.role === "user" ? "ml-auto bg-lime text-ink" : "bg-surface text-zinc-200"
              }`}
            >
              {message.text}
            </div>
          ))}
        </section>

        <form className="sticky bottom-0 flex gap-2 bg-ink pb-4 pt-2">
          <input className="h-12 flex-1 rounded-lg border border-line bg-surface px-3 outline-none focus:border-lime" placeholder="Ask about your next meal" />
          <button className="grid h-12 w-12 place-items-center rounded-lg bg-lime text-ink" aria-label="Send message">
            <Send size={19} />
          </button>
        </form>
      </div>
    </main>
  );
}

