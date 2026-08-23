"use client";

import { useEffect, useRef, useState } from "react";

export type ClipboardStatus = "copied" | "failed" | null;

export function useClipboardFeedback(timeout = 1800) {
  const [status, setStatus] = useState<ClipboardStatus>(null);
  const [feedbackValue, setFeedbackValue] = useState<string | null>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reset() {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = null;
    setStatus(null);
    setFeedbackValue(null);
  }

  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    };
  }, []);

  async function copy(value: string) {
    reset();
    setFeedbackValue(value);

    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }

    feedbackTimeout.current = setTimeout(reset, timeout);
  }

  return { copy, feedbackValue, reset, status };
}
