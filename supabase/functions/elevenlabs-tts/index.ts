// Supabase Edge Function: elevenlabs-tts
//
// Securely proxies text-to-speech requests to ElevenLabs so the API key
// never reaches the browser. Returns raw MP3 audio; the client caches it
// per session and falls back to browser speech synthesis when this
// function is unavailable or not yet configured.
//
// Deploy:   supabase functions deploy elevenlabs-tts
// Secrets:  supabase secrets set ELEVENLABS_API_KEY=your_key
//           supabase secrets set ELEVENLABS_VOICE_ID=voice_id   (optional)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// "Elise – Warm, Natural and Engaging" — the voice paired with the Eva
// avatar. (Override without redeploying via the ELEVENLABS_VOICE_ID secret.)
const DEFAULT_VOICE_ID = 'EST9Ui6982FZPSi7gCHi';
const MAX_TEXT_LENGTH = 1200;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    return jsonError('Text-to-speech is not configured', 503);
  }

  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  if (typeof text !== 'string' || !text.trim()) {
    return jsonError('Missing "text"', 400);
  }
  const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);

  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || DEFAULT_VOICE_ID;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: trimmed,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.2,
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('ElevenLabs error', response.status, detail);
    return jsonError('Text-to-speech generation failed', 502);
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
});
