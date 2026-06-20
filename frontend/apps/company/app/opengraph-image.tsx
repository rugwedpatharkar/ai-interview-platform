import { ImageResponse } from "next/og";

export const alt = "Aptura for companies — Hire on proven merit.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Midnight social card: deep indigo field, a cyan aperture-lens ring, wordmark + tagline.
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
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 28,
              background: "#4fd6e3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                border: "6px solid #0f1117",
              }}
            />
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>Aptura</div>
        </div>
        <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -3, marginTop: 56, lineHeight: 1.05 }}>
          Hire on proven merit.
        </div>
        <div style={{ fontSize: 34, color: "#9fb3d1", marginTop: 28 }}>
          Proctored interviews · evidence-based reports · no ghosting.
        </div>
      </div>
    ),
    { ...size },
  );
}
