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
  // Chrome ends a session after a pause; keep restarting until the agent stops.
  const wanted = useRef(false);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = constructor();
    if (!Ctor) {
      setError("This browser has no speech recognition. Use Google Chrome.");
      return;
    }
    recognition.current?.abort();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (r.isFinal) latest.current.onFinal(text);
        else interim += `${text} `;
      }
      latest.current.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setListening(false);
      setError(ERRORS[e.error] ?? `Speech recognition stopped (${e.error}).`);
    };
    rec.onend = () => {
      if (wanted.current && recognition.current === rec) rec.start();
      else setListening(false);
    };
    recognition.current = rec;
    wanted.current = true;
    setError(null);
    setListening(true);
    rec.start();
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      recognition.current?.abort();
    },
    [],
  );

  return { supported, listening, error, start, stop };
}
