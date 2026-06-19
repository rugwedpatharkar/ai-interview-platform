# PHASE 4 — Video + Recording

> Put the candidate on camera and store interview recordings for review. Builds on
> the P3 media path; the Interviewer brain remains unchanged. See `../ARCHITECTURE.md`.

## 1. Goal & scope
Candidate joins on **video**; the session is **recorded** and available for reviewer
playback (with consent). The agent may stay voice-only or gain a simple visual
presence (decided at P4 start). Scoring still runs on the transcript; any vision cues
are **optional and bias-sensitive**.

**Epic:** F (video) + storage. **New infra:** recording egress + object storage for
media.

## 2. Open decisions to confirm at P4 start
- **Agent presence:** voice-only agent + candidate-on-camera (simplest) vs an avatar.
- **Recording:** server-side egress (LiveKit egress) vs client-side; storage tier +
  retention window; encryption at rest.
- **Vision signals:** whether to capture any (presence only) — default OFF for
  scoring to avoid bias; if used, document + audit.

## 3. Architecture changes
- Extend the media path to carry **video tracks**; enable **recording egress** to
  object storage (R2/MinIO).
- `interviews` gains `recording_ref`, `recording_consent`, retention metadata.
- Reviewer **playback** in the company app (signed, time-limited URLs; access
  audit-logged).
- Consent flow extended to explicitly cover **video recording + storage**.

## 4. Module / file additions
```
ai-agents/transport/ video_transport.py (if agent visual presence) — else reuse voice
admin-service/api/ recordings.py (signed playback URLs, access audit)
admin-service/compliance/ retention.py (+ recording retention/deletion)
frontend/apps/candidate: camera permission/preview, recording consent screen
frontend/apps/company: recording playback (with key-moment markers)
infra: recording egress + media bucket
```

## 5. Interfaces / events
- REST: `GET /interviews/{id}/recording-url` (signed, audited);
  consent payload gains `video_recording`.
- Storage: media objects in object storage; refs on `interviews`.
- Scoring path unchanged (transcript-based).

## 6. Ordered build sequence
1. Add video tracks to the P3 media path; candidate camera preview + permission.
2. Recording egress → object storage; store `recording_ref` + retention metadata.
3. Extend consent to video recording/storage; gate start on consent.
4. Company-side playback (signed URLs, access audit); optional key-moment markers.
5. Retention/deletion covers recordings (GDPR).

## 7. Dependencies / prereqs (from P3)
- P3 media path (RTC/STT/TTS) + admin session ownership + token issuance.
- P1 compliance (consent/audit/retention) extended here.

## 8. Acceptance / verification
1. A full **video** interview completes and is recorded; `recording_ref` stored.
2. **Consent gate:** interview cannot start without recording consent; consent
   recorded.
3. **Playback:** only authorized recruiters (same `comp_id`, applicant relationship)
   get a signed URL; access is audit-logged.
4. **Retention/deletion:** candidate deletion removes recordings; retention window
   enforced.
5. **No bias regression:** scoring remains transcript-based unless a vision signal is
   explicitly enabled + documented.
6. **Regression:** P1 text + P3 voice still work.

## 9. Exit criteria → Phase 5
Video + recording stable and compliant → focus shifts to scale hardening + robust
integrity/proctoring + commercial features in P5.
