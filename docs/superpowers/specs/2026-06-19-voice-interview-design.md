# Voice Interview (Phase 3) — Design

> **Context.** The roadmap's Phase 3 (`docs/superpowers/plans/phases/PHASE_3.md`). Phases 1–2
> (text interview + aptitude + scoring + recruiter reports + the full frontend) are done and
> verified. This adds a **real-time spoken interview**: the candidate speaks, the AI interviewer
> speaks back — reusing the existing Interviewer LangGraph graph by swapping a **voice I/O channel**
> behind the established `Transport` seam. The "brain" (graph), scoring, funnel, and data ownership
> do not change. Personal project, online is fine (not offline), free stack. Decided with the user:
> full realtime via self-hosted **LiveKit**; STT = **Groq Whisper** (free tier); TTS = **edge-tts**
> (free); LLM = the existing **Gemini** graph. Proctoring signals (P4 audio / P5 visual) are a
> deliberate follow-up after voice.

## 1. Goal & scope
**In scope:** a candidate joins a live audio room, the AI asks questions aloud and listens; each
finalized utterance drives exactly one existing graph turn; the transcript (text + timings) is
persisted exactly as today so **scoring is byte-for-byte the same path**. The existing **text
interview remains** as both a fallback (no mic / unsupported browser) and a regression guarantee.

**Out of scope (deferred):** candidate **video** + recording (Phase 4); proctoring signals
(follow-up); avatar/visual agent; multi-language; phone/PSTN. YAGNI — voice-only, one language.

## 2. Decided stack (and why)
- **Realtime media:** self-hosted **LiveKit** (open-source, free, Docker) — SFU for browser↔worker
  audio + data (captions). Adds `livekit` (+ its Redis) to `docker-compose`.
- **STT:** **Groq Whisper** (`whisper-large-v3-turbo`) — free tier (2,000 audio req/day, fast);
  one free `GROQ_API_KEY`. Best realtime latency of the free options.
- **TTS:** **edge-tts** — free, no key, natural voices, low latency (free Microsoft endpoint).
- **Brain:** the **existing Gemini interviewer graph — unchanged** (`get_llm`).
- **Voice-only** for P3 (camera/video is P4).

## 3. Architecture (components + boundaries)
1. **LiveKit server** (`docker-compose`): per-interview room; browser publishes mic, subscribes to
   the agent's audio; data channel carries captions.
2. **admin — `POST /interview/{id}/rtc-token`** (new): authorizes the caller (owns the interview;
   state is `interview_pending`/in-progress), then mints a **short-lived, room-scoped LiveKit join
   token**. Admin still owns auth/session; no media flows through admin. Returns `{url, token, room}`.
3. **ai-agents voice worker** (new long-running component, started in `main.py` alongside the
   consumer + API): for an active interview room it joins as the "interviewer" participant and runs
   the loop — **VAD** (end-of-utterance) → **Groq STT** (utterance→text) → **one graph turn** (via
   `VoiceTransport`) → **edge-tts** (text→audio) published to the room → **captions** (both sides)
   published as LiveKit data messages.
4. **`VoiceTransport`** (ai-agents, new — implements the existing `Transport` contract): `say(text)`
   → enqueue TTS + caption; `get_candidate_answer()` → await the next finalized STT transcript. The
   graph loop (ask → await answer → ask …) is unchanged; only the channel differs from `TextTransport`.
5. **Candidate frontend** (new voice mode on the interview page): a `@ip/ws`-style LiveKit client —
   mic-permission + device pre-check, join via the admin token, render **live captions**,
   connection-quality indicator + auto-reconnect, an "end interview" control, and a **graceful
   fallback to the existing text interview** when the mic is denied or the browser lacks support.

**Data flow:** speak → LiveKit → worker (VAD+STT) → transcript → graph turn (Gemini) → next question
→ edge-tts → LiveKit → candidate hears; captions stream both ways; on completion the transcript
(text + timings) persists and `interview.completed` fires → Evaluator/scoring **identical to P1**.

## 4. Interfaces / events
- **New:** `POST /interview/{id}/rtc-token` → `{ url, token, room }` (admin; short-lived, scoped).
- **Unchanged:** `interview.completed` → Evaluator → `scoring.completed` → funnel `scored`.
- **Transcript:** reuse the existing `Transcript`/`TranscriptTurn` shape; store STT text + per-turn
  timings (additive, optional fields) so the report/scoring read path is unaffected.

## 5. Error handling / resilience
- **No mic / unsupported browser / denied permission:** detected at the device pre-check → fall back
  to the existing **text interview** (no dead end).
- **Mid-interview disconnect:** interview state already lives in the **Redis checkpointer**; rejoin
  resumes from the current question. The existing **time-budget reaper** still finalizes abandoned
  sessions (`interview.abandoned`).
- **STT empty/garbled utterance:** the agent re-prompts ("Sorry, I didn't catch that — could you
  repeat?") rather than recording an empty answer (reuses the existing empty-answer guard).
- **Worker/STT/TTS failure:** caught at the worker boundary; the turn is retried/re-prompted; a
  hard failure leaves the session resumable (state in Redis) — never a crash that loses the interview.
- **Token:** short TTL, single room, validated participant identity; admin authorizes before minting.

## 6. Testing
- **Unit (offline, deterministic):** `VoiceTransport` `say()`/`get_candidate_answer()` against a
  **fake LiveKit room + fake STT/TTS** (mirrors the existing `FakeTransport` pattern) — no network,
  no models. The interviewer graph + scoring tests are untouched (the **text path is the regression
  guarantee**).
- **Backend gate:** `bash scripts/check.sh` stays green (all new code sits behind injected seams with
  fakes for offline tests; LiveKit/Groq/edge-tts are never hit in unit tests).
- **Manual/local E2E (Chrome via preview):** a full spoken interview; mid-interview reconnect;
  mic-denied → text fallback; confirm the persisted transcript scores via the unchanged path.

## 7. Build order (de-risked, incremental — each step independently verifiable)
1. LiveKit in `docker-compose` + admin `rtc-token` endpoint (+ admin tests for auth/state gating).
2. Candidate UI joins the room, publishes mic, hears an **echo** — proves the media path end-to-end.
3. Voice worker: VAD + Groq STT + edge-tts loop + `VoiceTransport`; one **scripted** turn.
4. Wire the **real interviewer graph** through `VoiceTransport`; stream captions both ways.
5. Device pre-check, mic-denied **text fallback**, reconnect/resume from the Redis checkpoint.
6. Barge-in + latency tuning; persist transcript + timings; confirm **scoring + text-path regression**.

## 8. Risks / things to pin during planning
- **LiveKit / agent SDK API specifics** (and Silero VAD) — exact Python APIs + versions get pinned in
  the implementation plan (verified against current docs), not assumed here.
- **Local WebRTC:** browser↔LiveKit on the same machine generally needs no TURN; if NAT/host setup
  requires it, add coturn — flagged as a build-step contingency.
- **Latency:** Groq STT + edge-tts are fast; the Gemini turn dominates. Barge-in/turn-taking tuning is
  its own build step (6).
- **Groq free-tier limits** (2k audio req/day) — ample for personal testing; documented, not a blocker.

## 9. What stays unchanged (explicit non-goals of this change)
Interviewer graph, Evaluator/scoring, funnel state machine, data ownership/tenancy, the Redis
checkpointer, `interview.completed → Evaluator`, and the **text interview (`TextTransport`)** — which
remains the fallback and the regression baseline.
