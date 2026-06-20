"use client";

import { Alert, Button, Card, CardContent, Checkbox } from "@ip/ui";
import { useEffect, useRef, useState } from "react";

import { fakeStream } from "../app/interview/[applicationId]/rtc-room";

// Strict device pre-check: replaces the OLD optional consent with a REQUIRED flow. The Start
// button is disabled until BOTH the camera+mic stream is live AND the acknowledgment box is
// ticked. There is no "skip" — this is a strictly proctored interview.
//
// `mock` makes the pre-check pass offline (a canvas stream, no real camera). When not mocked
// the pre-check requests real devices; if that throws (no device / denied) it surfaces a
// required-access error and the candidate retries.
export function DevicePrecheck({
  onReady,
  mock = false,
}: {
  onReady: (media: MediaStream) => void;
  mock?: boolean;
}) {
  const [media, setMedia] = useState<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function requestDevices() {
    setErr(null);
    try {
      const stream = mock
        ? fakeStream()
        : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setMedia(stream);
    } catch {
      setErr(
        "Camera and microphone access is required for this interview. Enable them in your browser and retry.",
      );
    }
  }

  useEffect(() => {
    if (media && videoRef.current) videoRef.current.srcObject = media;
  }, [media]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <Alert tone="warning" title="This is a strictly proctored interview">
          Your camera and microphone stay on for the entire session — there is no mute or
          camera-off. The interview runs in fullscreen and is recorded for review. Leaving
          fullscreen, a second face or voice, a phone, screen sharing, or a virtual camera are
          flagged, and serious signals end the interview automatically.
        </Alert>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Camera self-view"
          className="aspect-video w-full rounded-lg bg-surface-muted"
        />
        {!media && (
          <Button onClick={requestDevices} className="self-start">
            Enable camera &amp; microphone
          </Button>
        )}
        {err && <Alert tone="danger">{err}</Alert>}
        {media && <Alert tone="success">Camera and microphone are ready.</Alert>}
        <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <Checkbox
            className="mt-0.5"
            checked={ack}
            onCheckedChange={(v) => setAck(v === true)}
            disabled={!media}
          />
          <span>
            I understand this interview is strictly proctored — camera and microphone required,
            no mute, fullscreen-locked, recorded — and that serious integrity signals end it
            automatically.
          </span>
        </label>
        <Button
          disabled={!media || !ack}
          onClick={() => media && onReady(media)}
          className="self-start"
        >
          Start interview
        </Button>
      </CardContent>
    </Card>
  );
}
