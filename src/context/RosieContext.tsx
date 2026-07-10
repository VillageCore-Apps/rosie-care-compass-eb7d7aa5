import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getGreetingReply,
  getRosieReply,
  RosieAction,
  RosieReply,
} from '@/lib/rosie/brain';
import {
  speechEngine,
  SpeakResult,
  SpeechStatus,
} from '@/lib/voice/speechEngine';

export type RosieMessage = {
  id: string;
  role: 'user' | 'rosie';
  text: string;
  speech?: string;
  actions?: RosieAction[];
  createdAt: number;
};

type SendResult = { message: RosieMessage; reply: RosieReply } | null;

type RosieContextType = {
  messages: RosieMessage[];
  isThinking: boolean;
  voiceEnabled: boolean;
  toggleVoice: () => void;
  /** Live speech status from the shared engine (state + which message). */
  speech: SpeechStatus;
  sendMessage: (text: string, opts?: { speak?: boolean }) => Promise<SendResult>;
  speakMessage: (message: RosieMessage, force?: boolean) => Promise<SpeakResult>;
  stopSpeaking: () => void;
  clearConversation: () => void;
  voiceModeOpen: boolean;
  openVoiceMode: () => void;
  closeVoiceMode: () => void;
};

const STORAGE_KEY = 'rosie-messages';
const MAX_STORED_MESSAGES = 60;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function greetingMessage(): RosieMessage {
  const greeting = getGreetingReply();
  return {
    id: newId(),
    role: 'rosie',
    text: greeting.text,
    speech: greeting.speech,
    actions: greeting.actions,
    createdAt: Date.now(),
  };
}

function loadMessages(): RosieMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RosieMessage[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  return [greetingMessage()];
}

const RosieContext = createContext<RosieContextType | undefined>(undefined);

export const RosieProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<RosieMessage[]>(loadMessages);
  const [isThinking, setIsThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => speechEngine.isEnabled());
  const [speech, setSpeech] = useState<SpeechStatus>(speechEngine.getStatus());
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => speechEngine.subscribe(setSpeech), []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_STORED_MESSAGES))
      );
    } catch {
      // storage full/unavailable — history just won't persist
    }
  }, [messages]);

  const speakMessage = useCallback(
    (message: RosieMessage, force = false): Promise<SpeakResult> => {
      return speechEngine.speak(message.speech ?? message.text, {
        utteranceId: message.id,
        force,
      });
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string, opts: { speak?: boolean } = {}): Promise<SendResult> => {
      const trimmed = text.trim();
      if (!trimmed || pendingRef.current) return null;
      pendingRef.current = true;

      const userMessage: RosieMessage = {
        id: newId(),
        role: 'user',
        text: trimmed,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsThinking(true);

      let reply: RosieReply;
      try {
        reply = await getRosieReply(trimmed);
      } catch {
        reply = {
          text: "I'm having a little trouble thinking right now. Could you try that again in a moment?",
        };
      }

      const rosieMessage: RosieMessage = {
        id: newId(),
        role: 'rosie',
        text: reply.text,
        speech: reply.speech,
        actions: reply.actions,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, rosieMessage]);
      setIsThinking(false);
      pendingRef.current = false;

      if (reply.navigateTo) navigate(reply.navigateTo);
      if (opts.speak !== false && speechEngine.isEnabled()) {
        void speakMessage(rosieMessage);
      }
      return { message: rosieMessage, reply };
    },
    [navigate, speakMessage]
  );

  const stopSpeaking = useCallback(() => speechEngine.stop(), []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      speechEngine.setEnabled(!prev);
      return !prev;
    });
  }, []);

  const clearConversation = useCallback(() => {
    speechEngine.stop();
    setMessages([greetingMessage()]);
  }, []);

  const openVoiceMode = useCallback(() => setVoiceModeOpen(true), []);
  const closeVoiceMode = useCallback(() => {
    speechEngine.stop();
    setVoiceModeOpen(false);
  }, []);

  return (
    <RosieContext.Provider
      value={{
        messages,
        isThinking,
        voiceEnabled,
        toggleVoice,
        speech,
        sendMessage,
        speakMessage,
        stopSpeaking,
        clearConversation,
        voiceModeOpen,
        openVoiceMode,
        closeVoiceMode,
      }}
    >
      {children}
    </RosieContext.Provider>
  );
};

export const useRosie = (): RosieContextType => {
  const context = useContext(RosieContext);
  if (!context) {
    throw new Error('useRosie must be used within a RosieProvider');
  }
  return context;
};
