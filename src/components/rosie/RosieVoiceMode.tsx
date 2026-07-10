import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Send, X } from 'lucide-react';
import { useRosie, RosieMessage } from '@/context/RosieContext';
import {
  createRecognizer,
  isSpeechRecognitionSupported,
  Recognizer,
} from '@/lib/voice/recognition';

/**
 * Immersive, Siri-style voice conversation with Rosie.
 *
 * State machine: idle → listening → thinking → speaking → (one automatic
 * follow-up listen) → idle. Tapping anywhere interrupts speech or starts
 * listening. Uses the same speech engine and chat history as the chat panel.
 */

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

const STATE_CAPTIONS: Record<VoiceState, string> = {
  idle: 'Tap anywhere to talk to me',
  listening: "I'm listening…",
  thinking: 'Let me think…',
  speaking: 'Tap to interrupt me',
};

const RosieVoiceMode = () => {
  const {
    voiceModeOpen,
    closeVoiceMode,
    sendMessage,
    speakMessage,
    stopSpeaking,
    isThinking,
  } = useRosie();

  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastReply, setLastReply] = useState<RosieMessage | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const [typedDraft, setTypedDraft] = useState('');

  const stateRef = useRef<VoiceState>('idle');
  const recognizerRef = useRef<Recognizer | null>(null);
  const followUpUsedRef = useRef(false);
  const gotFinalRef = useRef(false);

  const recognitionSupported = isSpeechRecognitionSupported();

  const setVoiceState = useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const stopRecognizer = useCallback(() => {
    recognizerRef.current?.abort();
    recognizerRef.current = null;
  }, []);

  const handleUserInput = useCallback(
    async (text: string) => {
      setTranscript(text);
      setVoiceState('thinking');
      const result = await sendMessage(text, { speak: false });
      if (!result) {
        setVoiceState('idle');
        return;
      }
      setLastReply(result.message);
      setVoiceState('speaking');
      // Voice mode always speaks — that's the whole point of being here.
      const outcome = await speakMessage(result.message, true);
      if (stateRef.current !== 'speaking') return; // user interrupted
      if (outcome === 'completed' && !followUpUsedRef.current && recognitionSupported) {
        // One automatic follow-up listen so the conversation flows naturally.
        followUpUsedRef.current = true;
        startListening(false);
      } else {
        setVoiceState('idle');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendMessage, speakMessage, recognitionSupported]
  );

  const startListening = useCallback(
    (manual: boolean) => {
      if (!recognitionSupported) return;
      if (manual) followUpUsedRef.current = false;
      stopRecognizer();
      setTranscript('');
      setHint(null);
      gotFinalRef.current = false;
      setVoiceState('listening');

      const recognizer = createRecognizer({
        onInterim: (text) => setTranscript(text),
        onFinal: (text) => {
          gotFinalRef.current = true;
          void handleUserInput(text);
        },
        onError: (error) => {
          if (stateRef.current !== 'listening') return;
          if (error === 'not-allowed' || error === 'service-not-allowed') {
            setMicBlocked(true);
            setHint('I need microphone permission to hear you. You can type below instead.');
          } else if (error !== 'no-speech' && error !== 'aborted') {
            setHint("I couldn't quite hear that — tap to try again.");
          }
          setVoiceState('idle');
        },
        onEnd: () => {
          // Mic session ended without a final result — return to idle calmly.
          if (!gotFinalRef.current && stateRef.current === 'listening') {
            setVoiceState('idle');
          }
        },
      });
      recognizerRef.current = recognizer;
      recognizer?.start();
    },
    [recognitionSupported, stopRecognizer, handleUserInput, setVoiceState]
  );

  // Opening the overlay is itself a tap, so we can begin listening right away.
  useEffect(() => {
    if (voiceModeOpen) {
      followUpUsedRef.current = false;
      setLastReply(null);
      setTranscript('');
      setHint(null);
      if (recognitionSupported) {
        startListening(true);
      } else {
        setHint("Voice input isn't supported in this browser, but you can type below and I'll still speak my answers.");
        setVoiceState('idle');
      }
    } else {
      stopRecognizer();
      setVoiceState('idle');
    }
    return () => stopRecognizer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceModeOpen]);

  if (!voiceModeOpen) return null;

  const handleTap = () => {
    if (stateRef.current === 'speaking') {
      stopSpeaking();
      if (recognitionSupported) startListening(true);
      else setVoiceState('idle');
    } else if (stateRef.current === 'listening') {
      // Stop the mic; if something was heard, onFinal will take over.
      recognizerRef.current?.stop();
    } else if (stateRef.current === 'idle') {
      startListening(true);
    }
    // 'thinking' taps are ignored — Rosie is almost done anyway.
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopRecognizer();
    stopSpeaking();
    closeVoiceMode();
  };

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = typedDraft.trim();
    if (!text || stateRef.current === 'thinking') return;
    setTypedDraft('');
    void handleUserInput(text);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-[#1c2e4a] via-[#24455c] to-[#2e5d66] text-white animate-fade-in cursor-pointer select-none"
      onClick={handleTap}
      role="dialog"
      aria-modal="true"
      aria-label="Voice conversation with Rosie"
    >
      {/* Close */}
      <div className="w-full flex justify-end p-5">
        <button
          onClick={handleClose}
          aria-label="Close voice mode"
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition active:scale-95"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Orb */}
      <div className="flex flex-col items-center px-6">
        <div className="relative w-44 h-44 flex items-center justify-center">
          {state === 'listening' && (
            <>
              <span className="absolute inset-0 rounded-full bg-[#9CE6E6]/30 rosie-ripple" />
              <span
                className="absolute inset-2 rounded-full bg-[#4D9CFF]/30 rosie-ripple"
                style={{ animationDelay: '0.6s' }}
              />
            </>
          )}
          {state === 'speaking' && (
            <>
              <span className="absolute inset-0 rounded-full bg-[#4D9CFF]/25 rosie-ripple" />
              <span
                className="absolute inset-3 rounded-full bg-[#9CE6E6]/25 rosie-ripple"
                style={{ animationDelay: '0.4s' }}
              />
            </>
          )}
          <img
            src="/blue-rosie.png"
            alt=""
            className={`relative w-36 h-36 rounded-full object-cover border-4 shadow-2xl transition-all duration-500 ${
              state === 'idle'
                ? 'border-white/30 rosie-breathe'
                : state === 'listening'
                  ? 'border-[#9CE6E6]'
                  : state === 'thinking'
                    ? 'border-white/50 opacity-80 rosie-breathe'
                    : 'border-[#4D9CFF]'
            }`}
          />
        </div>

        {/* State indicator */}
        <div className="h-10 mt-6 flex items-center justify-center">
          {state === 'thinking' || isThinking ? (
            <span className="flex gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="rosie-dot w-3 h-3 rounded-full bg-white/80"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          ) : state === 'speaking' ? (
            <span className="flex items-end gap-1.5 h-8" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="rosie-eq-bar w-1.5 rounded-full bg-[#9CE6E6]"
                  style={{ height: '100%', animationDelay: `${i * 0.13}s` }}
                />
              ))}
            </span>
          ) : state === 'listening' ? (
            <Mic className="h-8 w-8 text-[#9CE6E6] rosie-breathe" />
          ) : null}
        </div>

        <p className="mt-3 text-xl font-medium text-white/90 text-center">
          {STATE_CAPTIONS[state]}
        </p>

        {/* Live transcript / reply */}
        <div className="mt-5 max-w-md text-center min-h-[3.5rem]">
          {state === 'listening' && transcript && (
            <p className="text-lg text-[#9CE6E6] italic">“{transcript}”</p>
          )}
          {(state === 'speaking' || state === 'idle') && lastReply && (
            <p className="text-base text-white/80 leading-relaxed max-h-40 overflow-y-auto">
              {lastReply.speech ?? lastReply.text}
            </p>
          )}
          {hint && <p className="text-base text-amber-200/90 mt-2">{hint}</p>}
        </div>
      </div>

      {/* Bottom area */}
      <div className="w-full max-w-md px-6 pb-10" onClick={(e) => e.stopPropagation()}>
        {(!recognitionSupported || micBlocked) && (
          <form onSubmit={handleTypedSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={typedDraft}
              onChange={(e) => setTypedDraft(e.target.value)}
              placeholder="Type to Rosie…"
              aria-label="Type a message to Rosie"
              className="flex-1 min-w-0 px-4 py-3 rounded-full bg-white/10 border border-white/25 text-white placeholder-white/50 text-base focus:outline-none focus:ring-2 focus:ring-[#9CE6E6]/60"
            />
            <button
              type="submit"
              disabled={!typedDraft.trim()}
              aria-label="Send"
              className="p-3 rounded-full bg-[#4D9CFF] text-white disabled:opacity-40 transition active:scale-95"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        )}
        {recognitionSupported && !micBlocked && (
          <p className="text-center text-sm text-white/50">
            Your conversation is saved in the chat, so you can pick up where you left off.
          </p>
        )}
      </div>
    </div>
  );
};

export default RosieVoiceMode;
