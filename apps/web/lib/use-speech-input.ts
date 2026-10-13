"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// The Web Speech API isn't in TypeScript's DOM types yet; this is the part we use.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

const constructor = (): RecognitionConstructor | null => {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it in the browser's site settings.",
  "service-not-allowed": "Microphone access was blocked. Allow it in the browser's site settings.",
  "audio-capture": "No microphone was found.",
  network: "This browser can't reach a speech recognition service. Use Google Chrome.",
  "language-not-supported": "This browser doesn't support English speech recognition.",
};

/**
 * Live speech-to-text with the browser's built-in recogniser (free, no key; Chrome sends the
 * audio to Google's speech service). It streams like a telephony recogniser: `onInterim` with
 * text that keeps changing, then `onFinal` once a phrase settles. Speaker labels come from the
 * caller, not the audio: in production each side of the call is its own audio channel.
 */
export function useSpeechInput(handlers: { onInterim: (text: string) => void; onFinal: (text: string) => void }) {
  const supported = useSyncExternalStore(
    () => () => {},
    () => constructor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  // Sessions thrown away by cancel(): anything they still deliver is dropped.
  const cancelled = useRef(new WeakSet<Recognition>());
  // Chrome ends a session after a pause; keep restarting until the agent stops.
  const wanted = useRef(false);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  /** Stop listening; the phrase being spoken is still delivered. */
  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
    setListening(false);
  }, []);

  /** Stop and discard: nothing the session still delivers reaches the handlers (the call is over). */
  const cancel = useCallback(() => {
    wanted.current = false;
    const rec = recognition.current;
    if (rec) {
      cancelled.current.add(rec);
      rec.abort();
    }
    recognition.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = constructor();
    if (!Ctor) {
      setError("This browser has no speech recognition. Use Google Chrome.");
      return;
    }
    // A session still running is replaced; one that's stopping is left to deliver its last phrase.
    if (wanted.current) recognition.current?.abort();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      if (cancelled.current.has(rec)) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const text = r[0].transcript.trim();
        // An empty final still ends the phrase, so the next one starts with the current speaker.
        if (r.isFinal) latest.current.onFinal(text);
        else if (text) interim += `${text} `;
      }
      latest.current.onInterim(interim.trim());
    };
    // Events from a session that has since been replaced must not change the current one's state.
    rec.onerror = (e) => {
      if (recognition.current !== rec || e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setListening(false);
      setError(ERRORS[e.error] ?? `Speech recognition stopped (${e.error}).`);
    };
    rec.onend = () => {
      if (recognition.current !== rec) return;
      if (wanted.current) rec.start();
      else setListening(false);
    };
    recognition.current = rec;
    wanted.current = true;
    setError(null);
    setListening(true);
    rec.start();
  }, []);

  useEffect(() => cancel, [cancel]);

  return { supported, listening, error, start, stop, cancel };
}
