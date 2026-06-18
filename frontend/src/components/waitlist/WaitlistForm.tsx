"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

type WaitlistRole = "member" | "trainer" | "gym_owner";

const roleOptions: Array<{ value: WaitlistRole; label: string }> = [
  { value: "member", label: "Member" },
  { value: "trainer", label: "Trainer" },
  { value: "gym_owner", label: "Gym owner" }
];

export function WaitlistForm() {
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<WaitlistRole>("member");
  const [gymOrCompany, setGymOrCompany] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!fullName.trim()) {
      setStatus("error");
      setMessage("Please enter your name.");
      return;
    }

    if (!contact.trim()) {
      setStatus("error");
      setMessage("Please enter your email or WhatsApp number.");
      return;
    }

    setStatus("saving");

    try {
      await api("/waitlist", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          contact,
          role,
          gymOrCompany,
          country
        })
      });
      setStatus("saved");
      setMessage("You're on the Ascend pilot waitlist. We will contact you when access opens for your gym or region.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not join the waitlist. Please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-calm/30 bg-surface/85 p-5 shadow-2xl shadow-black/25">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">Pilot waitlist</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Get early access to Ascend.</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          Join as a member, trainer, or gym owner. We are opening access carefully so the pilot stays clean.
        </p>
      </div>

      <div className="mt-5 grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-zinc-200">Name</span>
          <input
            className="h-12 rounded-lg border border-line bg-ink px-4 text-base text-white outline-none transition focus:border-calm"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-zinc-200">Email or WhatsApp</span>
          <input
            className="h-12 rounded-lg border border-line bg-ink px-4 text-base text-white outline-none transition focus:border-calm"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="you@email.com or +60..."
            autoComplete="email"
          />
        </label>

        <div>
          <span className="text-sm font-semibold text-zinc-200">I am a</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {roleOptions.map((option) => {
              const selected = role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  className={`h-11 rounded-lg border px-2 text-sm font-bold transition ${
                    selected ? "border-calm bg-calm text-ink" : "border-line bg-ink text-zinc-200"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-zinc-200">Gym or company</span>
            <input
              className="h-12 rounded-lg border border-line bg-ink px-4 text-base text-white outline-none transition focus:border-calm"
              value={gymOrCompany}
              onChange={(event) => setGymOrCompany(event.target.value)}
              placeholder="Optional"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-zinc-200">Country</span>
            <input
              className="h-12 rounded-lg border border-line bg-ink px-4 text-base text-white outline-none transition focus:border-calm"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              placeholder="Optional"
              autoComplete="country-name"
            />
          </label>
        </div>
      </div>

      {message ? (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm leading-6 ${
            status === "saved" ? "border-calm/40 bg-calm/10 text-calm" : "border-red-500/40 bg-red-500/10 text-red-100"
          }`}
        >
          {status === "saved" ? <CheckCircle2 className="mr-2 inline" size={16} /> : null}
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "saving"}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-calm px-5 font-bold text-ink shadow-xl shadow-calm/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "saving" ? "Joining..." : "Join the pilot waitlist"}
        {status !== "saving" ? <ArrowRight size={19} /> : null}
      </button>
    </form>
  );
}
