import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aptura for companies",
    short_name: "Aptura",
    description: "Hire on proven merit.",
    start_url: "/",
    display: "standalone",
    background_color: "#15161e",
    theme_color: "#15161e",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon.svg", type: "image/svg+xml", sizes: "180x180" },
    ],
  };
}
