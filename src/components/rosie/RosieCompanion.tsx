import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  MessageCircle,
  Mic,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useRosie, RosieMessage } from '@/context/RosieContext';
import { timeOfDayGreeting } from '@/lib/rosie/brain';

/** Animated equalizer bars shown while Rosie is speaking. */
export const SpeakingBars = ({ className = '' }: { className?: string }) => (
  <span className={`inline-flex items-end gap-[3px] h-4 ${className}`} aria-hidden>
    {[0, 1, 2, 3].map((i) => (
      <span
        key={i}
        className="rosie-eq-bar w-[3px] rounded-full bg-current"
        style={{ height: '100%', animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </span>
);

const ROUTE_TIPS: Array<{ prefix: string; tip: string }> = [
  { prefix: '/chapters', tip: 'These are our story chapters — tap one that speaks to you, or ask me to find a topic.' },
  { prefix: '/resources', tip: 'Looking for something specific? Ask me and I\'ll point you to the right resource.' },
  { prefix: '/flashcards', tip: 'CareTalk Cards are gentle conversation starters. Try one with your loved one today.' },
  { prefix: '/book-details', tip: 'This is our official book. Ask me anything about the chapters here.' },
  { prefix: '/', tip: 'I can find stories, resources, or a moment of calm — just ask, or tap the mic to talk.' },
];

function routeTip(pathname: string): string {
  const match = ROUTE_TIPS.find(
    (r) => r.prefix !== '/' && pathname.startsWith(r.prefix)
  );
  return (match ?? ROUTE_TIPS[ROUTE_TIPS.length - 1]).tip;
}

const RosieAvatar = ({ speaking, size = 'w-14 h-14' }: { speaking: boolean; size?: string }) => (
  <div className={`relative shrink-0 ${size}`}>
    {speaking && (
      <>
        <span className="absolute inset-0 rounded-full bg-[#4D9CFF]/40 rosie-ripple" />
        <span
          className="absolute inset-0 rounded-full bg-[#9CE6E6]/40 rosie-ripple"
          style={{ animationDelay: '0.5s' }}
        />
      </>
    )}
    <img
      src="/blue-rosie.png"
      alt="Rosie"
      className={`relative w-full h-full rounded-full object-cover border-[3px] shadow-md transition-colors ${
        speaking ? 'border-[#4D9CFF]' : 'border-[#e4e8e1]'
      }`}
    />
  </div>
);

const MessageBubble = ({ message }: { message: RosieMessage }) => {
  const { speech, speakMessage, stopSpeaking } = useRosie();
  const navigate = useNavigate();
  const isRosie = message.role === 'rosie';
  const isSpeakingThis =
    speech.utteranceId === message.id && speech.state !== 'idle';

  if (!isRosie) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#5a7a85] text-white px-4 py-2.5 text-base leading-relaxed shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%]">
        <div className="rounded-2xl rounded-bl-md bg-white border border-[#dbe4e0] px-4 py-2.5 text-base text-[#2d3436] leading-relaxed shadow-sm">
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
            <ReactMarkdown>{message.text}</ReactMarkdown>
          </div>
          {message.actions && message.actions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2.5">
              {message.actions.map((action) => (
                <button
                  key={`${message.id}-${action.to}-${action.label}`}
                  onClick={() => navigate(action.to)}
                  className="text-sm font-medium px-3 py-1.5 rounded-full border border-[#5a7a85]/40 text-[#3f5c66] bg-[#f2f7f5] hover:bg-[#e2efe9] active:scale-95 transition"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 ml-1 text-[#5a7a85]">
          {isSpeakingThis ? (
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-1.5 text-xs font-medium hover:text-[#3f5c66]"
              aria-label="Stop speaking"
            >
              <SpeakingBars className="text-[#4D9CFF]" />
              {speech.state === 'loading' ? 'Preparing voice…' : 'Speaking — tap to stop'}
            </button>
          ) : (
            <button
              onClick={() => void speakMessage(message, true)}
              className="flex items-center gap-1 text-xs font-medium hover:text-[#3f5c66]"
              aria-label="Replay this message aloud"
            >
              <Volume2 className="h-3.5 w-3.5" />
              Replay
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ThinkingDots = () => (
  <div className="flex justify-start">
    <div className="rounded-2xl rounded-bl-md bg-white border border-[#dbe4e0] px-4 py-3 shadow-sm">
      <span className="flex gap-1.5" aria-label="Rosie is thinking">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="rosie-dot w-2 h-2 rounded-full bg-[#5a7a85]"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
    </div>
  </div>
);

const RosieCompanion = () => {
  const {
    messages,
    isThinking,
    voiceEnabled,
    toggleVoice,
    speech,
    sendMessage,
    speakMessage,
    openVoiceMode,
  } = useRosie();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  const isSpeaking = speech.state === 'speaking' || speech.state === 'loading';

  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isThinking, expanded]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    // Speak the greeting the first time the user opens the chat (a real tap,
    // so audio playback is allowed by the browser).
    if (next && !greetedRef.current && voiceEnabled) {
      greetedRef.current = true;
      try {
        if (!sessionStorage.getItem('rosie-greeted')) {
          sessionStorage.setItem('rosie-greeted', 'true');
          const latestRosie = [...messages].reverse().find((m) => m.role === 'rosie');
          if (latestRosie) void speakMessage(latestRosie);
        }
      } catch {
        // sessionStorage unavailable — skip the spoken greeting
      }
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void sendMessage(text);
  };

  const statusLine = isThinking
    ? 'Thinking…'
    : speech.state === 'loading'
      ? 'Preparing to speak…'
      : speech.state === 'speaking'
        ? 'Speaking…'
        : routeTip(location.pathname);

  return (
    <section
      aria-label="Rosie, your care companion"
      className="mt-4 rounded-3xl border border-[#dbe4e0] bg-gradient-to-br from-[#f4f9ff] via-white to-[#f0f7f2] shadow-lg overflow-hidden"
    >
      {/* Header bar — always visible at the top of the app */}
      <div className="flex items-center gap-3 p-4">
        <button onClick={handleExpand} aria-label="Open Rosie chat" className="active:scale-95 transition">
          <RosieAvatar speaking={isSpeaking} />
        </button>
        <button onClick={handleExpand} className="flex-1 min-w-0 text-left">
          <p className="font-bold text-[#232323] text-base leading-tight">
            {timeOfDayGreeting()}, I'm Rosie 🌷
          </p>
          <p className="text-sm text-[#5a7a85] leading-snug mt-0.5 line-clamp-2">
            {statusLine}
          </p>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleVoice}
            aria-label={voiceEnabled ? 'Turn Rosie\'s voice off' : 'Turn Rosie\'s voice on'}
            title={voiceEnabled ? 'Voice on' : 'Voice off'}
            className={`p-2.5 rounded-full transition active:scale-95 ${
              voiceEnabled
                ? 'bg-[#e2efe9] text-[#3f5c66]'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {voiceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            onClick={() => openVoiceMode()}
            aria-label="Talk to Rosie"
            title="Talk to Rosie"
            className="p-2.5 rounded-full bg-gradient-to-br from-[#4D9CFF] to-[#3a7fd6] text-white shadow-md transition active:scale-95"
          >
            <Mic className="h-5 w-5" />
          </button>
          <button
            onClick={handleExpand}
            aria-label={expanded ? 'Close chat' : 'Open chat'}
            aria-expanded={expanded}
            className="p-2.5 rounded-full bg-[#f2f7f5] text-[#3f5c66] transition active:scale-95"
          >
            {expanded ? <ChevronDown className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Expandable chat panel */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          expanded ? 'max-h-[70vh] opacity-100' : 'max-h-0 opacity-0'
        } overflow-hidden`}
      >
        <div className="border-t border-[#dbe4e0] bg-[#f7fafc]/70">
          <div
            ref={listRef}
            className="px-4 py-4 space-y-3 max-h-[45vh] overflow-y-auto"
            aria-live="polite"
          >
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isThinking && <ThinkingDots />}
          </div>
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 p-3 border-t border-[#dbe4e0] bg-white"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Rosie anything…"
              aria-label="Message Rosie"
              className="flex-1 min-w-0 px-4 py-3 rounded-full border border-[#dbe4e0] bg-[#f7fafc] text-base focus:outline-none focus:ring-2 focus:ring-[#4D9CFF]/50"
            />
            <button
              type="submit"
              disabled={!draft.trim() || isThinking}
              aria-label="Send message"
              className="p-3 rounded-full bg-[#5a7a85] text-white disabled:opacity-40 transition active:scale-95"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default RosieCompanion;
