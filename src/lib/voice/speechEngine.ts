/**
 * Rosie's voice function lives in the VillageCore-owned Supabase project
 * (joshuav-villagecore's Project), separate from the content database the
 * rest of the app reads.
 *
 * We call it with a plain fetch rather than supabase-js `functions.invoke`
 * on purpose: invoke() sniffs the response Content-Type and decodes our
 * `audio/mpeg` body as *text*, so `data` came back as a string and never
 * satisfied the `instanceof Blob` check — the app then silently fell back
 * to the robotic browser voice every time. Reading the response as a blob
 * ourselves keeps the real MP3 intact.
 */
const TTS_ENDPOINT =
  'https://dvhijzvaslvgihiikprd.supabase.co/functions/v1/elevenlabs-tts';
const TTS_PUBLISHABLE_KEY = 'sb_publishable_2zcZgT_3M7kWoKI_H_dvAw_2E_c34vi';

/**
 * Centralized voice service for Rosie.
 *
 * Every spoken response in the app goes through `speak()` so there is a
 * single source of truth for what is playing, and starting a new utterance
 * always cancels the previous one. Audio is produced by an ElevenLabs
 * Supabase Edge Function when available, with an automatic fallback to the
 * browser's built-in speech synthesis. Generated audio is cached for the
 * session so replaying a message is instant and never re-bills the API.
 */

export type SpeechState = 'idle' | 'loading' | 'speaking';

export type SpeakResult =
  | 'completed'
  | 'interrupted'
  | 'disabled'
  | 'unavailable'
  | 'error';

export type SpeechStatus = {
  state: SpeechState;
  /** Identifier of the message being spoken (e.g. a chat message id). */
  utteranceId: string | null;
};

export type SpeakOptions = {
  utteranceId?: string;
  /** Speak even when the user's voice setting is off (used by voice mode). */
  force?: boolean;
};

type Listener = (status: SpeechStatus) => void;

const VOICE_PREF_KEY = 'rosie-voice-enabled';
const MAX_CACHE_ENTRIES = 40;
const ELEVENLABS_RETRY_DELAY_MS = 30_000;

/** Strip markdown, emoji and layout noise so text reads naturally aloud. */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> label
    .replace(/[*_#`>~]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\u{FE0F}/gu, '') // emoji variation selector
    .replace(/\s+/g, ' ')
    .trim();
}

class SpeechEngine {
  private listeners = new Set<Listener>();
  private status: SpeechStatus = { state: 'idle', utteranceId: null };
  private token = 0;
  private audio: HTMLAudioElement | null = null;
  private keepAlive: number | null = null;
  private resolveActive: ((result: SpeakResult) => void) | null = null;
  /** Session cache: sanitized text -> object URL of generated audio. */
  private cache = new Map<string, string>();
  /** Time of the last failed request; retries are allowed after a short pause. */
  private elevenLabsFailedAt: number | null = null;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const load = () => {
        this.voices = window.speechSynthesis.getVoices();
      };
      load();
      window.speechSynthesis.addEventListener?.('voiceschanged', load);
    }
  }

  isEnabled(): boolean {
    try {
      return localStorage.getItem(VOICE_PREF_KEY) !== 'false';
    } catch {
      return true;
    }
  }

  setEnabled(enabled: boolean) {
    try {
      localStorage.setItem(VOICE_PREF_KEY, String(enabled));
    } catch {
      // storage unavailable; treat as session-only setting
    }
    if (!enabled) this.stop();
  }

  getStatus(): SpeechStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private emit(state: SpeechState, utteranceId: string | null) {
    this.status = { state, utteranceId };
    this.listeners.forEach((l) => l(this.status));
  }

  /** Speak `text`, cancelling anything currently playing first. */
  async speak(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
    const clean = sanitizeForSpeech(text);
    if (!clean) return 'completed';
    if (!opts.force && !this.isEnabled()) return 'disabled';

    this.cancelActive();
    const myToken = ++this.token;
    const uid = opts.utteranceId ?? null;
    this.emit('loading', uid);

    const canTryElevenLabs =
      this.elevenLabsFailedAt === null ||
      Date.now() - this.elevenLabsFailedAt >= ELEVENLABS_RETRY_DELAY_MS;
    if (canTryElevenLabs) {
      const url = await this.fetchElevenLabsAudio(clean);
      if (this.token !== myToken) return 'interrupted';
      if (url) return this.playAudio(url, clean, myToken, uid);
    }
    return this.speakWithBrowser(clean, myToken, uid);
  }

  /** Stop any current speech and return to idle. */
  stop() {
    this.token++;
    this.cancelActive();
    this.emit('idle', null);
  }

  private cancelActive() {
    if (this.audio) {
      const a = this.audio;
      this.audio = null;
      a.onended = null;
      a.onerror = null;
      a.onplay = null;
      a.pause();
      a.removeAttribute('src');
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.keepAlive !== null) {
      window.clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
    if (this.resolveActive) {
      const resolve = this.resolveActive;
      this.resolveActive = null;
      resolve('interrupted');
    }
  }

  private async fetchElevenLabsAudio(text: string): Promise<string | null> {
    const cached = this.cache.get(text);
    if (cached) {
      // refresh LRU position
      this.cache.delete(text);
      this.cache.set(text, cached);
      return cached;
    }
    try {
      const response = await fetch(TTS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TTS_PUBLISHABLE_KEY}`,
          apikey: TTS_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      const data = response.ok ? await response.blob() : null;
      if (!data || !data.type.startsWith('audio') || data.size === 0) {
        this.elevenLabsFailedAt = Date.now();
        return null;
      }
      this.elevenLabsFailedAt = null;
      const url = URL.createObjectURL(data);
      this.cache.set(text, url);
      while (this.cache.size > MAX_CACHE_ENTRIES) {
        const oldest = this.cache.keys().next().value as string;
        const oldUrl = this.cache.get(oldest);
        this.cache.delete(oldest);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
      }
      return url;
    } catch {
      this.elevenLabsFailedAt = Date.now();
      return null;
    }
  }

  private playAudio(
    url: string,
    text: string,
    myToken: number,
    uid: string | null
  ): Promise<SpeakResult> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: SpeakResult) => {
        if (settled) return;
        settled = true;
        if (this.resolveActive === resolveOnce) this.resolveActive = null;
        if (this.audio === audio) this.audio = null;
        if (this.token === myToken) this.emit('idle', null);
        resolve(result);
      };
      const resolveOnce = (result: SpeakResult) => settle(result);
      this.resolveActive = resolveOnce;

      const audio = new Audio(url);
      this.audio = audio;
      audio.onplay = () => {
        if (this.token === myToken) this.emit('speaking', uid);
      };
      audio.onended = () => settle('completed');
      audio.onerror = () => settle('error');
      audio.play().catch(() => {
        // Playback blocked or failed — try the browser voice instead.
        if (settled || this.token !== myToken) return;
        settled = true;
        if (this.resolveActive === resolveOnce) this.resolveActive = null;
        if (this.audio === audio) this.audio = null;
        resolve(this.speakWithBrowser(text, myToken, uid));
      });
    });
  }

  private speakWithBrowser(
    text: string,
    myToken: number,
    uid: string | null
  ): Promise<SpeakResult> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (this.token === myToken) this.emit('idle', null);
      return Promise.resolve('unavailable');
    }
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: SpeakResult) => {
        if (settled) return;
        settled = true;
        if (this.resolveActive === resolveOnce) this.resolveActive = null;
        if (this.keepAlive !== null) {
          window.clearInterval(this.keepAlive);
          this.keepAlive = null;
        }
        if (this.token === myToken) this.emit('idle', null);
        resolve(result);
      };
      const resolveOnce = (result: SpeakResult) => settle(result);
      this.resolveActive = resolveOnce;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.02;
      const voice = this.pickVoice();
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (this.token === myToken) this.emit('speaking', uid);
      };
      utterance.onend = () => settle('completed');
      utterance.onerror = (e) =>
        settle(
          e.error === 'interrupted' || e.error === 'canceled'
            ? 'interrupted'
            : 'error'
        );

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

      // Chrome silently stops long utterances; a periodic resume keeps it alive.
      this.keepAlive = window.setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.resume();
        }
      }, 5000);
    });
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (!this.voices.length && 'speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices();
    }
    const english = this.voices.filter((v) => v.lang?.startsWith('en'));
    const pool = english.length ? english : this.voices;
    const preferred = [
      'Samantha',
      'Google US English',
      'Microsoft Aria',
      'Microsoft Jenny',
      'Microsoft Zira',
      'Karen',
      'Moira',
      'Victoria',
      'Female',
    ];
    for (const name of preferred) {
      const match = pool.find((v) => v.name.includes(name));
      if (match) return match;
    }
    return pool[0] ?? null;
  }
}

export const speechEngine = new SpeechEngine();

export function speak(text: string, opts?: SpeakOptions): Promise<SpeakResult> {
  return speechEngine.speak(text, opts);
}
