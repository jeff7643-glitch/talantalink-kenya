"use client";

import { useState } from "react";

export default function ShareButton({ name }: { name: string }) {
  const [message, setMessage] = useState("");

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} | TalantaLink`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("Profile link copied.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("Could not share the profile link. Copy it from your browser address bar.");
    }
  }

  return <div className="profile-share-control">
    <button className="primary-button" type="button" onClick={() => void share()}>Share profile <span>↗</span></button>
    {message && <span role="status">{message}</span>}
  </div>;
}
