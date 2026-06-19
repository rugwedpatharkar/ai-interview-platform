# PHASE 3 — Voice Interview

> Add spoken interviews by swapping a **voice transport** behind the unchanged
> Interviewer graph. The brain stays the same; only the I/O channel changes.
> See `../ARCHITECTURE.md` (interview flow) and `../AI_AGENTS.md`.

## 1. Goal & scope
Candidate speaks; the agent speaks back — a real-time voice conversation — reusing
the P1 Interviewer LangGraph graph via the `Transport` abstraction. No change to
scoring, funnel, or data ownership.

**Epic:** F (voice). **New infra:** a free realtime stack (STT + TTS + WebRTC).

## 2. Open decisions to confirm at P3 start
- **Realtime provider:** self-hosted **LiveKit** (open-source) vs a free-tier RTC.
- **STT:** Whisper (faster-whisper) / Groq Whisper vs Gemini audio.
- **TTS:** Piper / edge-tts (free) vs cloud free tier.
- **Agent presence:** voice-only vs a simple visual/avatar (P4 adds candidate video).

## 3. Architecture changes
- `agent/transport.py` gains a **`VoiceTransport`** implementing the same
  `say()` / `get_candidate_answer()` contract as `TextTransport` — the graph is
  unchanged.
- A **media path**: browser ↔ LiveKit ↔ a voice worker (STT→graph turn→TTS),
  fronted by the admin-service for auth/session (admin still owns the session;
  signaling/token issuance via admin).
- **Barge-in / turn-taking / VAD** handled by the realtime stack.
- Redis checkpointer still persists interview state (resume after drop).

## 4. Module / file additions
```
ai-agents/transport/ voice_transport.py ; service/ voice_worker.py (STT/TTS loop)
admin-service/api/ interview_ws.py (+ media signaling, LiveKit token issuance)
frontend/ packages/ws + apps/candidate: LiveKit client, mic permission/device check,
          live captions, connection-quality UI
infra: livekit (or chosen RTC) added to docker-compose
```

## 5. Interfaces / events
- New: signaling/token endpoint (`POST /interview/{id}/rtc-token`).
- Interview turn still flows through the graph; `interview.completed` unchanged →
  Evaluator/scoring identical to P1.
- Transcript now produced from STT (store both audio-derived text + timings).

## 6. Ordered build sequence
1. Stand up the realtime stack locally; admin issues join tokens (scoped).
2. `VoiceTransport` + voice worker (STT→graph→TTS) behind the existing graph.
3. Candidate UI: device/permission pre-check, live captions, reconnect.
4. Turn-taking/barge-in tuning; latency budget; partial-transcript handling.
5. Persist audio-derived transcript; confirm scoring path unchanged.

## 7. Dependencies / prereqs (from P1/P2)
- P1 Interviewer graph + `Transport` abstraction + Redis checkpointer + scoring.
- P2 not required, but RAG-grounded question plans (P2) enrich voice interviews.

## 8. Acceptance / verification
1. A full **spoken** interview completes; transcript + structured_data persisted;
   scoring identical to text path (graph unchanged).
2. **Resilience:** mid-interview disconnect resumes from the Redis checkpoint.
3. **Latency:** turn round-trip within target; barge-in works; no hot-path crawling.
4. **Regression:** text interview (P1) still works via `TextTransport`.

## 9. Exit criteria → Phase 4
Voice interview stable behind the transport seam; media path proven → add candidate
**video** + recording in P4 with minimal new surface.
