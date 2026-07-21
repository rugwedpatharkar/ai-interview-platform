import { ImageResponse } from "next/og";

export const alt = "Aptura — Get seen. Get interviewed. Get hired.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Midnight social card: deep indigo field, a white aperture mark, wordmark + tagline.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "96px",
          background: "linear-gradient(135deg, #15161e 0%, #1a2440 60%, #123244 100%)",
          color: "#f7f7f9",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="100" height="100" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="27" stroke="#ffffff" strokeWidth={3} />
            <path d="M43 32L55.4 45.5" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M37.5 41.5L32 59" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M26.5 41.5L8.6 45.5" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M21 32L8.6 18.5" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M26.5 22.5L32 5" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M37.5 22.5L55.4 18.5" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>Aptura</div>
        </div>
        <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -3, marginTop: 56, lineHeight: 1.05 }}>
          Get seen. Get interviewed. Get hired.
        </div>
        <div style={{ fontSize: 34, color: "#9fb3d1", marginTop: 28 }}>
          One proctored interview · merit-based · every application answered.
        </div>
      </div>
    ),
    { ...size },
  );
}
