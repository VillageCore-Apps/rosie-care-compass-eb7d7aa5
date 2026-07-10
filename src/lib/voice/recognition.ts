/**
 * Thin wrapper around the Web Speech API's SpeechRecognition so the rest of
 * the app never touches vendor-prefixed globals directly.
 */

type RecognitionResultList = {
  length: number;
  [index: number]: {
    isFinal: boolean;
    [index: number]: { transcript: string };
  };
};

type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionConstructor = new () => RecognitionInstance;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export type RecognizerCallbacks = {
  /** Live partial transcript while the user is still talking. */
  onInterim?: (transcript: string) => void;
  /** Final transcript once the user finishes a phrase. */
  onFinal?: (transcript: string) => void;
  onError?: (error: string) => void;
  /** Fires when the microphone session ends, with or without a result. */
  onEnd?: () => void;
};

export type Recognizer = {
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function createRecognizer(
  callbacks: RecognizerCallbacks
): Recognizer | null {
  const Ctor = getRecognitionConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = navigator.language?.startsWith('en')
    ? navigator.language
    : 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (final.trim()) callbacks.onFinal?.(final.trim());
    else if (interim.trim()) callbacks.onInterim?.(interim.trim());
  };
  recognition.onerror = (event) => callbacks.onError?.(event.error);
  recognition.onend = () => callbacks.onEnd?.();

  return {
    start: () => {
      try {
        recognition.start();
      } catch {
        // start() throws if already running — safe to ignore
      }
    },
    stop: () => recognition.stop(),
    abort: () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    },
  };
}
