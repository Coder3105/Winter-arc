import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Winter Arc",
    short_name: "Winter Arc",
    description: "A private 90-day discipline and body-transformation protocol.",
    start_url: "/launch.html",
    scope: "/",
    display: "standalone",
    background_color: "#03070c",
    theme_color: "#03070c",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
