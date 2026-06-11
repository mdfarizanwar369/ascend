"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { getMe, getMessageContacts, getMessages, sendMessage } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";

type Contact = Awaited<ReturnType<typeof getMessageContacts>>["contacts"][number];
type Message = Awaited<ReturnType<typeof getMessages>>["messages"][number];

function roleLabel(role: string) {
  if (role === "trainer") return "Trainer";
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Client";
}

export function MessagesClient({ initialContactId }: { initialContactId?: string }) {
  const [currentUserId, setCurrentUserId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState(initialContactId ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("Loading messages...");
  const [isSending, setIsSending] = useState(false);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? contacts[0],
    [contacts, selectedContactId]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadContacts() {
      try {
        const [me, contactResponse] = await Promise.all([getMe(), getMessageContacts()]);
        if (!isMounted) return;

        setCurrentUserId(me.user.id);
        setContacts(contactResponse.contacts);
        setSelectedContactId((current) => current || contactResponse.contacts[0]?.id || "");
        setStatus(contactResponse.contacts.length ? "" : "No message contacts yet. Ask the owner to assign a trainer.");
      } catch {
        if (isMounted) setStatus("Log in again if messages do not load.");
      }
    }

    loadContacts();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedContact?.id) return;
    let isMounted = true;

    async function loadThread() {
      try {
        const response = await getMessages(selectedContact.id);
        if (!isMounted) return;
        setMessages(response.messages);
        setStatus("");
      } catch {
        if (isMounted) setStatus("Could not load this conversation.");
      }
    }

    loadThread();
    return () => {
      isMounted = false;
    };
  }, [selectedContact?.id]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || !selectedContact?.id) return;

    setIsSending(true);
    setBody("");

    try {
      const response = await sendMessage({ receiverUserId: selectedContact.id, body: trimmed });
      setMessages((current) => [...current, response.message]);
      setStatus("");
    } catch {
      setBody(trimmed);
      setStatus("Could not send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-md flex-col">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <div>
            <p className="text-sm text-zinc-400">Messages</p>
            <h1 className="text-2xl font-semibold">{selectedContact?.full_name ?? "Trainer chat"}</h1>
          </div>
        </header>

        {contacts.length > 1 ? (
          <section className="mt-2 flex gap-2 overflow-x-auto pb-2">
            {contacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelectedContactId(contact.id)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left ${
                  selectedContact?.id === contact.id ? "border-lime bg-lime text-ink" : "border-line bg-surface text-white"
                }`}
              >
                <span className="block text-sm font-semibold">{contact.full_name}</span>
                <span className="text-xs opacity-75">{roleLabel(contact.primary_role)}</span>
              </button>
            ))}
          </section>
        ) : null}

        {status ? <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        <section className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-lg border border-line bg-surface p-3">
          {messages.map((message) => {
            const mine = message.sender_user_id === currentUserId;
            return (
              <article key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] rounded-lg px-3 py-2 ${mine ? "bg-lime text-ink" : "bg-ink text-zinc-100"}`}>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  <p className={`mt-1 text-[11px] ${mine ? "text-ink/70" : "text-zinc-500"}`}>
                    {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              </article>
            );
          })}
          {!messages.length && !status ? (
            <p className="rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-400">No messages yet. Send a quick check-in to start.</p>
          ) : null}
        </section>

        <form onSubmit={handleSend} className="mt-3 flex gap-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Type a message..."
            rows={1}
            className="min-h-12 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none focus:border-lime"
          />
          <button
            type="submit"
            disabled={!body.trim() || !selectedContact?.id || isSending}
            className="grid h-12 w-12 place-items-center rounded-lg bg-lime text-ink disabled:opacity-60"
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </main>
  );
}
