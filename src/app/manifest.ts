import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TalantaLink Kenya",
    short_name: "TalantaLink",
    description: "Kenya’s talent community and opportunities marketplace.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f4",
    theme_color: "#17231e",
    icons: [
      {
        src: "/talantalink-logo.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
    ],
  };
}
