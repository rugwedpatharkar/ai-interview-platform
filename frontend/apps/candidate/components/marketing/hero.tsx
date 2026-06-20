"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, cn } from "@ip/ui";
import { Search, ArrowRight } from "lucide-react";
import { HERO, COMPANY_HIRE_HREF } from "../../app/(marketing)/content";
import { RoleFork, type Role } from "./role-fork";

export function Hero() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("seeker");
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (loc.trim()) params.set("location", loc.trim());
    router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <section className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#7c3aed,#4f46e5)] text-white">
      {/* Faint aperture motif — focus/clarity, never a watching eye. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full border border-white/10"
      />
      <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
        <span className="text-sm font-medium uppercase tracking-wide text-white/80">{HERO.eyebrow}</span>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">{HERO.h1}</h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-white/90 sm:text-lg">{HERO.subhead}</p>

        <div className="mt-8 flex justify-center">
          <RoleFork value={role} onChange={setRole} />
        </div>

        {role === "seeker" ? (
          <form onSubmit={onSearch} className="mx-auto mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Job title or skill"
              placeholder="Title or skill"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-white text-foreground"
            />
            <Input
              aria-label="Location"
              placeholder="Location"
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              className="bg-white text-foreground sm:max-w-[40%]"
            />
            <Button type="submit" size="lg" className="bg-white text-brand-700 hover:bg-white/90">
              <Search className="size-4" aria-hidden /> Search
            </Button>
          </form>
        ) : (
          <a
            href={COMPANY_HIRE_HREF}
            className="mx-auto mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-brand-700 transition-colors hover:bg-white/90"
          >
            Post a job <ArrowRight className="size-4" aria-hidden />
          </a>
        )}

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/80">
          {HERO.micro.map((m) => (
            <li
              key={m}
              className={cn("after:mx-2 after:text-white/40 after:content-['·'] last:after:content-['']")}
            >
              {m}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
