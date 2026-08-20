"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send } from "lucide-react";
import { getMe, getMessageContacts, getMessages, sendMessage } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { SectionShell, SkeletonBlock, SkeletonCardList } from "@/components/PerceivedLoading";

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
  const [contactSearch, setContactSearch] = useState("");
  const [isTrainerView, setIsTrainerView] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? contacts[0],
    [contacts, selectedContactId]
  );
  const isInitialLoading = !contacts.length && !messages.length && status.startsWith("Loading");
  const visibleContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    return query ? contacts.filter((contact) => `${contact.full_name} ${contact.email}`.toLowerCase().includes(query)) : contacts;
  }, [contactSearch, contacts]);

  useEffect(() => {
    let isMounted = true;

    async function loadContacts() {
      try {
        const [me, contactResponse] = await Promise.all([getMe(), getMessageContacts()]);
        if (!isMounted) return;

        setCurrentUserId(me.user.id);
        setIsTrainerView(me.roles.some((role) => ["trainer", "owner", "admin"].includes(role)));
        setContacts(contactResponse.contacts);
        setSelectedContactId((current) => current || contactResponse.contacts[0]?.id || "");
        setStatus(contactResponse.contacts.length ? "" : me.roles.some((role) => ["trainer", "owner", "admin"].includes(role)) ? "No assigned client conversations yet." : "No trainer conversation is available yet.");
      } catch {
        if (isMounted) setStatus("Log in again if messages do not load.");
      }
    }

    async function refreshContacts() {
      try {
        const contactResponse = await getMessageContacts();
        if (!isMounted) return;
        setContacts(contactResponse.contacts);
      } catch {
        // Keep the existing inbox usable when a background refresh fails.
      }
    }

    loadContacts();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshContacts();
    }, 30_000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
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
        setContacts((current) => current.map((contact) => contact.id === selectedContact.id ? { ...contact, unread_count: 0 } : contact));
        setStatus("");
      } catch (error) {
        if (isMounted) setStatus(error instanceof Error ? error.message : "Could not load this conversation.");
      }
    }

    loadThread();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadThread();
    }, 20_000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [selectedContact?.id]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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

  if (isInitialLoading) {
    return (
      <main className="min-h-screen bg-ink px-4 py-5 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-md flex-col">
          <header className="flex items-center gap-3 py-3">
            <BackButton fallbackHref="/dashboard" />
            <SkeletonBlock className="h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="mt-2 h-7 w-40" />
            </div>
          </header>
          <SectionShell title="Conversation">
            <SkeletonCardList count={3} compact />
          </SectionShell>
          <div className="mt-3 flex gap-2">
            <SkeletonBlock className="h-12 flex-1 rounded-lg" />
            <SkeletonBlock className="h-12 w-12 rounded-lg" />
          </div>
          <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-md flex-col">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <ProfileAvatar src={selectedContact?.profile_photo_url} name={selectedContact?.full_name} size="sm" />
          <div className="min-w-0">
            <p className="text-sm text-zinc-400">Messages</p>
            <h1 className="truncate text-2xl font-semibold">{selectedContact?.full_name ?? "Trainer chat"}</h1>
          </div>
        </header>

        {contacts.length > 1 ? (
          <section className="mt-2">
            {contacts.length > 5 || isTrainerView ? (
              <label className="mb-2 flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-calm/50">
                <Search size={17} className="text-zinc-500" />
                <input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </label>
            ) : null}
            <div className="flex gap-2 overflow-x-auto pb-2">
            {visibleContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelectedContactId(contact.id)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left ${
                  selectedContact?.id === contact.id ? "border-lime bg-lime text-ink" : "border-line bg-surface text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <ProfileAvatar src={contact.profile_photo_url} name={contact.full_name} size="sm" />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {contact.full_name}
                      {Number(contact.unread_count ?? 0) > 0 ? <span className="rounded-full bg-calm px-2 py-0.5 text-[10px] font-bold text-ink">{Number(contact.unread_count)}</span> : null}
                    </span>
                    <span className="text-xs opacity-75">{roleLabel(contact.primary_role)}</span>
                  </span>
                </span>
              </button>
            ))}
            {!visibleContacts.length ? <p className="px-2 py-3 text-sm text-zinc-400">No conversations match that name.</p> : null}
            </div>
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
          <div ref={threadEndRef} aria-hidden="true" />
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
