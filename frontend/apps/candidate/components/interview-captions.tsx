"use client";

import { useEffect, useRef } from "react";

// Live captions pane for the proctored room. Final lines render solid; interim lines render
// muted. Auto-scrolls to the latest line. Mirrors the old text-interview log styling so the
// candidate reads the interviewer's questions as they're spoken.
export interface CaptionLine {
  text: string;
  final: boolean;
}

export function InterviewCaptions({ lines }: { lines: CaptionLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Interview captions"
      className="flex max-h-72 flex-col gap-1.5 overflow-y-auto p-4"
    >
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Captions will appear here as the interviewer speaks.
        </p>
      ) : (
        lines.map((line, i) => (
          <p
            key={i}
            className={
              line.final
                ? "text-sm text-foreground"
                : "text-sm italic text-muted-foreground"
            }
          >
            {line.text}
          </p>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}
