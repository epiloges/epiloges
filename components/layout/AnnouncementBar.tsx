"use client";

import { useEffect, useState } from "react";

interface AnnouncementBarProps {
  messages: string[];
  intervalMs?: number;
}

export function AnnouncementBar({ messages, intervalMs = 5000 }: AnnouncementBarProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [messages.length, intervalMs]);

  if (messages.length === 0) return null;

  return (
    <div className="relative z-50 flex h-9 items-center justify-center overflow-hidden bg-luxe-black px-4 text-luxe-white">
      {/* A new key remounts the line, and the entrance runs on mount; the outgoing line
          goes at once — a 9px strip does not need a two-phase crossfade. */}
      <p key={index} className="animate-in fade-in slide-in-from-bottom-1 text-center text-[11px] tracking-[0.15em] uppercase duration-400">
        {messages[index]}
      </p>
    </div>
  );
}
