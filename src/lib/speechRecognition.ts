// Thin wrapper around the browser's built-in SpeechRecognition Web API (no
// external speech backend exists in this codebase) — not in the standard DOM
// lib types, so lib.dom.d.ts doesn't declare it, and Chrome/Safari still only
// expose it under the webkit-prefixed name.

export interface MinimalSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { transcript: string }[][] } & { resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export function getSpeechRecognitionCtor(): (new () => MinimalSpeechRecognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => MinimalSpeechRecognition; webkitSpeechRecognition?: new () => MinimalSpeechRecognition };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
