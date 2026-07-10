import { searchContent } from '@/lib/searchContent';
import { fetchChapters } from '@/lib/supabase/supabaseApi';

/**
 * Rosie's conversational brain. Turns a user's message into a warm reply,
 * optional navigation, and tappable suggestions — using the app's own
 * content (chapters, topics, stories, books) from Supabase.
 */

export type RosieAction = {
  label: string;
  to: string;
};

export type RosieReply = {
  /** What Rosie shows in the chat bubble. */
  text: string;
  /** Optional simpler phrasing for the voice (defaults to `text`). */
  speech?: string;
  /** Tappable suggestion chips rendered under the message. */
  actions?: RosieAction[];
  /** When set, the app navigates there right away (explicit commands only). */
  navigateTo?: string;
};

const HOME_ACTIONS: RosieAction[] = [
  { label: 'Explore stories', to: '/chapters' },
  { label: 'Browse resources', to: '/resources' },
  { label: 'CareTalk Cards', to: '/flashcards' },
];

export function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getGreetingReply(): RosieReply {
  return {
    text: `${timeOfDayGreeting()}! I'm Rosie, your caregiving companion. I can find stories and resources for you, guide you around the app, or just keep you company. What would you like to do today?`,
    speech: `${timeOfDayGreeting()}! I'm Rosie, your caregiving companion. I can find stories and resources, guide you around the app, or just keep you company. What would you like to do today?`,
    actions: HOME_ACTIONS,
  };
}

function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'is', 'are',
  'was', 'were', 'be', 'been', 'do', 'does', 'did', 'can', 'could', 'would',
  'should', 'will', 'to', 'of', 'in', 'on', 'for', 'with', 'about', 'and',
  'or', 'what', 'where', 'when', 'how', 'who', 'why', 'tell', 'show', 'find',
  'me', 'please', 'some', 'any', 'there', 'it', 'this', 'that', 'have', 'has',
  'want', 'need', 'looking', 'help', 'more', 'rosie',
]);

function extractKeywords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** True when the user is commanding navigation ("take me to…", "open…"). */
function isNavigationCommand(lower: string): boolean {
  return /\b(take me|go to|open|bring me|navigate|show me the|let'?s go)\b/.test(
    lower
  );
}

type Destination = {
  pattern: RegExp;
  to: string;
  name: string;
  blurb: string;
};

const DESTINATIONS: Destination[] = [
  {
    pattern: /\b(stor(y|ies)|chapters?)\b/,
    to: '/chapters',
    name: 'Stories',
    blurb:
      'Our stories are grouped into chapters, each one written from real caregiving journeys.',
  },
  {
    pattern: /\bresources?\b/,
    to: '/resources',
    name: 'Resources',
    blurb:
      'The Resources section has practical guidance and support for caregivers.',
  },
  {
    pattern: /\b(flashcards?|caretalk|care talk|cards?)\b/,
    to: '/flashcards',
    name: 'CareTalk Cards',
    blurb:
      'CareTalk Cards are gentle conversation starters you can use with your loved one.',
  },
  {
    pattern: /\b(books?)\b/,
    to: '/',
    name: 'the book section on the home page',
    blurb: 'You can find our official book on the home page.',
  },
  {
    pattern: /\b(music|songs?|playlist)\b/,
    to: '/',
    name: 'the music section on the home page',
    blurb: 'There is calming music on the home page — scroll down a little to find it.',
  },
  {
    pattern: /\b(home|start|main page|beginning)\b/,
    to: '/',
    name: 'Home',
    blurb: 'The home page has our featured stories, book, and music.',
  },
];

function buildSearchActions(
  results: NonNullable<Awaited<ReturnType<typeof searchContent>>>
): { actions: RosieAction[]; summary: string[]; primaryTo?: string } {
  const actions: RosieAction[] = [];
  const summary: string[] = [];

  for (const chapter of results.chapters.slice(0, 2)) {
    actions.push({ label: `📖 ${chapter.name}`, to: `/chapters/${chapter.id}/topics` });
    summary.push(`the chapter "${chapter.name}"`);
  }
  for (const topic of results.topics.slice(0, 2)) {
    actions.push({
      label: `💬 ${topic.name}`,
      to: `/chapters/${topic.chapter_id}/topics/${topic.id}/stories`,
    });
    summary.push(`the topic "${topic.name}"`);
  }
  for (const story of results.stories.slice(0, 2)) {
    actions.push({
      label: `✨ ${story.title}`,
      to: `/chapters/${story.chapter_id}/topics/${story.topic_id}/stories?storyId=${story.id}`,
    });
    summary.push(`the story "${story.title}"`);
  }
  for (const book of results.books.slice(0, 1)) {
    actions.push({ label: `📚 ${book.title}`, to: `/book-details/${book.id}` });
    summary.push(`the book "${book.title}"`);
  }

  const trimmed = actions.slice(0, 5);
  return { actions: trimmed, summary: summary.slice(0, 5), primaryTo: trimmed[0]?.to };
}

async function recommendChapters(intro: string): Promise<RosieReply> {
  try {
    const chapters = await fetchChapters();
    const featured = (chapters ?? []).slice(0, 3);
    if (!featured.length) {
      return {
        text: `${intro} The Stories section is a lovely place to begin.`,
        actions: HOME_ACTIONS,
      };
    }
    const names = featured.map((c) => c.name).join(', ');
    return {
      text: `${intro} Here are a few chapters other caregivers often start with: ${names}. Tap one below and I'll take you there.`,
      speech: `${intro} A few chapters other caregivers often start with are ${names}. Tap one and I'll take you there.`,
      actions: featured.map((c) => ({
        label: `📖 ${c.name}`,
        to: `/chapters/${c.id}/topics`,
      })),
    };
  } catch {
    return {
      text: `${intro} The Stories section is a lovely place to begin.`,
      actions: HOME_ACTIONS,
    };
  }
}

/**
 * A curated caregiving knowledge base. Each entry gives Rosie a *specific*,
 * non-generic answer to a common question, and a `locate` query she uses to
 * find and open the matching page from the app's real content (Legal,
 * Housing, Safety chapters and their topics). Ordered most-specific first so
 * "living will" is answered before the broader "will/estate" entry.
 */
type Knowledge = {
  id: string;
  patterns: RegExp;
  /** Query passed to searchContent to open the real page for this topic. */
  locate: string;
  /** The chat answer (markdown allowed). */
  answer: string;
  /** Simpler phrasing spoken aloud (defaults to `answer`). */
  speech?: string;
};

const KNOWLEDGE: Knowledge[] = [
  {
    id: 'power-of-attorney',
    patterns: /\bpower of attorney\b|\bpoa\b|\battorney[- ]in[- ]fact\b/,
    locate: 'Power of Attorney',
    answer:
      "Being someone's power of attorney means you're legally allowed to act for them. There are two kinds you'll hear about: a **healthcare (medical) power of attorney** lets you make medical decisions when they can't speak for themselves, and a **financial power of attorney** lets you handle their money, bills, and property.\n\nA few things to know:\n- It must be signed **while your loved one still understands the document** — usually witnessed or notarized.\n- Keep certified copies to give to doctors, banks, and care facilities.\n- Rules vary by state, so having an elder-law attorney look it over is worth it.\n\nI'm opening our Legal section on Power of Attorney so you can see how other caregivers handled it.",
    speech:
      "Being someone's power of attorney means you're legally allowed to act for them. There are two kinds: a healthcare power of attorney for medical decisions, and a financial one for money and property. It has to be signed while your loved one still understands it, usually witnessed or notarized, and rules vary by state, so an elder-law attorney is worth it. I'm opening our Legal section on power of attorney for you.",
  },
  {
    id: 'advance-directive',
    patterns: /\b(advance directive|living will|end[- ]of[- ]life wishes|dnr|do not resuscitate)\b/,
    locate: 'Advance Directive',
    answer:
      "An **advance directive** (a living will is one form of it) is a document where your loved one writes down the medical care they'd want — or not want — if they ever couldn't speak for themselves. It can cover things like resuscitation, breathing machines, and feeding tubes.\n\nIt's a gift to you as a caregiver, because it means the hardest decisions are guided by *their* wishes, not left on your shoulders alone. Give copies to their doctor and keep one where you can find it quickly. I'm opening that page for you now.",
    speech:
      "An advance directive, and a living will is one form of it, is where your loved one writes down the medical care they would or wouldn't want if they couldn't speak for themselves. It guides the hardest decisions by their wishes, not yours alone. Keep copies with their doctor and somewhere easy to reach. I'm opening that page for you.",
  },
  {
    id: 'polst',
    patterns: /\bpolst\b|physician orders? for life/,
    locate: 'POLST',
    answer:
      "A **POLST** (Physician Orders for Life-Sustaining Treatment) is a medical order signed by a doctor that turns your loved one's wishes into instructions emergency responders and hospitals must follow. It's meant for people who are seriously ill or frail — more immediate than an advance directive. Keep it visible (many families post it on the fridge) so it's found in an emergency. I'm pulling up that page for you.",
  },
  {
    id: 'hipaa',
    patterns: /\bhipaa\b|medical (records|privacy|information)|access (to )?(their )?(medical|health) (records|info)/,
    locate: 'HIPAA',
    answer:
      "**HIPAA** is the privacy law that keeps medical information protected — which sometimes means doctors won't share details with you even though you're the caregiver. The fix is simple: have your loved one sign a **HIPAA authorization** naming you, so providers can talk to you freely. It's separate from a power of attorney, and most clinics have a one-page form. I'm opening our page on it.",
  },
  {
    id: 'guardianship',
    patterns: /\b(guardianship|conservator(ship)?|declared incompetent|incompeten|competen|court.*(control|decisions))\b/,
    locate: 'Declared Incompetent',
    answer:
      "**Guardianship** (sometimes called conservatorship) is when a court appoints someone to make decisions for a person who can no longer make them safely. It usually only comes up when there's *no* power of attorney already in place, because it's a slower, court-supervised process. If your loved one can still sign documents, setting up powers of attorney now is almost always easier than guardianship later. I'm opening our page on being declared incompetent.",
  },
  {
    id: 'estate-will',
    patterns: /\b(last will|will and testament|estate plan|estate|probate|inherit|beneficiar)\w*\b/,
    locate: 'Last Will and Testament',
    answer:
      "A **last will and testament** spells out how your loved one wants their belongings and money handled after they pass, and who should carry it out (the executor). It's different from a living will, which is about medical care while they're alive. Having it done — along with beneficiary designations kept up to date — spares the family confusion and conflict later. I'm opening our page on it.",
  },
  {
    id: 'hospice',
    patterns: /\bhospice\b|comfort care|terminal|end.stage/,
    locate: 'Hospice',
    answer:
      "**Hospice** is comfort-focused care for someone whose illness is no longer being cured — the goal shifts to keeping them peaceful, out of pain, and surrounded by support. It's usually available when a doctor expects six months or less, it can happen at home, and it includes nurses, aides, and emotional and spiritual support for the *whole family*, including you. Choosing it isn't giving up — it's choosing comfort. I'm opening our Hospice page.",
  },
  {
    id: 'respite',
    patterns: /\b(respite|a break|time (off|for myself)|burn(ed|t)? ?out|need rest|can'?t keep|caregiver fatigue)\b/,
    locate: 'Respite',
    answer:
      "What you're describing has a name: you need **respite** — planned time off from caregiving so you can rest and refill. It's not selfish; it's what keeps you able to keep caring. Respite can be a few hours from a friend, an adult day program, or a short facility stay that gives you a weekend. Please don't wait until you're completely empty. I'm opening our page on respite.",
  },
  {
    id: 'falls',
    patterns: /\b(falls?|falling|fell|trip(ped|ping)?|slip(ped|pery)?|unsteady|balance)\b/,
    locate: 'Falls',
    answer:
      "Falls are one of the biggest worries in caregiving, and small changes prevent most of them: clear walkways and loose rugs, add grab bars in the bathroom, keep good lighting and a nightlight for bathroom trips, and have their footwear and medications reviewed (some cause dizziness). If a fall does happen, don't rush to lift them — check for pain first. I'm opening our Safety page on falls.",
  },
  {
    id: 'driving',
    patterns: /\b(driving|drive|car keys|take (away )?the keys|licen[sc]e|behind the wheel)\b/,
    locate: 'Driving Privileges',
    answer:
      "Talking about giving up driving is one of the hardest conversations, because it's really about independence. Approach it as concern, not control — name specific things you've noticed, involve their doctor (a medical recommendation carries weight and takes you out of the 'bad guy' role), and offer a plan for how they'll still get where they need to go. I'm opening our page on driving privileges.",
  },
  {
    id: 'medication',
    patterns: /\b(medication|medicine|meds|pills|prescriptions?|pill (box|organizer)|forget(ting)? (to take|their)|dosage)\b/,
    locate: 'Medicine',
    answer:
      "Managing medications gets overwhelming fast. What helps most: a weekly **pill organizer** (or a pharmacy that pre-sorts doses into dated packets), one up-to-date list of everything they take including supplements, and a simple routine tied to meals. Ask the pharmacist to review the full list for interactions — they'll do it for free. I'm opening our page on medicine management.",
  },
  {
    id: 'money-matters',
    patterns: /\b(money|finances?|bills?|paying for care|afford|cost of care|budget|savings)\b/,
    locate: 'Money Matters',
    answer:
      "Money is one of the heaviest parts of caregiving, and you don't have to figure it out alone. Get the bills and accounts organized in one place, look into what they may qualify for (Medicaid, VA benefits, and long-term-care insurance are common ones people miss), and if you're handling their money, keep your spending separate and documented. I'm opening our page on money matters.",
  },
  {
    id: 'assisted-living',
    patterns: /\b(assisted living|nursing home|skilled nursing|pace program|care (home|facility)|placement)\b/,
    locate: 'Assisted Living',
    answer:
      "Deciding on assisted living or a care facility is loaded with guilt for most caregivers — please be gentle with yourself. Assisted living suits someone who needs help with daily tasks but not constant medical care; skilled nursing is for higher medical needs. Visit more than once, at different times of day, and trust how the staff treat residents. I'm opening our page on assisted living.",
  },
  {
    id: 'memory-care',
    patterns: /\b(memory care|dementia|alzheimer|memory loss|confus(ed|ion)|wandering)\b/,
    locate: 'Memory Care',
    answer:
      "Caring for someone with memory loss asks so much of you. A few things that help day to day: keep routines and surroundings familiar, don't argue with their reality — meet them where they are, and simplify choices. **Memory care** facilities are built specifically for this, with secured spaces and trained staff, when home becomes unsafe. I'm opening our page on memory care.",
  },
  {
    id: 'incontinence',
    patterns: /\b(incontinen|accidents?|diapers?|briefs?|bladder|bowel|toileting)\b/,
    locate: 'Incontinence',
    answer:
      "Incontinence is common and nothing to be ashamed of — for either of you. Protect the dignity of the moment: keep supplies discreet and within reach, use a calm matter-of-fact tone, set gentle bathroom reminders on a schedule, and check the skin to prevent irritation. Ask the doctor too, since some causes are treatable. I'm opening our page on incontinence.",
  },
];

function matchKnowledge(lower: string): Knowledge | null {
  for (const entry of KNOWLEDGE) {
    if (entry.patterns.test(lower)) return entry;
  }
  return null;
}

/**
 * Runs a KB entry: gives its specific answer and opens the real page for it,
 * resolved live from the app's content so links stay valid as content changes.
 */
async function answerFromKnowledge(entry: Knowledge): Promise<RosieReply> {
  let actions: RosieAction[] = [];
  let navigateTo: string | undefined;
  try {
    const results = await searchContent(entry.locate);
    if (results) {
      const built = buildSearchActions(results);
      actions = built.actions;
      navigateTo = built.primaryTo;
    }
  } catch {
    // fall through to the resources fallback below
  }
  if (!navigateTo) {
    actions = [{ label: 'Browse resources', to: '/resources' }];
    navigateTo = '/resources';
  }
  return { text: entry.answer, speech: entry.speech ?? entry.answer, actions, navigateTo };
}

export async function getRosieReply(input: string): Promise<RosieReply> {
  const lower = input.toLowerCase().trim();

  // Simple greetings
  if (/^(hi|hiya|hello|hey|good (morning|afternoon|evening))\b[\s!.,]*$/i.test(lower)) {
    return {
      text: pick([
        `${timeOfDayGreeting()}! It's lovely to hear from you. What can I help you with today?`,
        `Hello there! I'm right here with you. Would you like a story, a resource, or just a chat?`,
      ]),
      actions: HOME_ACTIONS,
    };
  }

  // Capabilities / help
  if (/\b(what can you do|how do you work|help me use|how does this (app|work)|what is this app|who are you)\b/.test(lower) || lower === 'help') {
    return {
      text:
        "I'm Rosie — think of me as a friendly guide by your side. I can:\n\n" +
        '- **Find stories** from caregivers who have walked this path\n' +
        '- **Point you to resources** for the challenges you face\n' +
        '- **Suggest CareTalk Cards** to spark meaningful conversations\n' +
        '- **Take you anywhere** in the app — just say "take me to resources"\n\n' +
        'You can type to me, or tap the microphone to talk instead.',
      speech:
        "I'm Rosie, your friendly guide. I can find stories from other caregivers, point you to helpful resources, suggest conversation cards, and take you anywhere in the app. You can type to me, or tap the microphone to talk.",
      actions: HOME_ACTIONS,
    };
  }

  // Thanks
  if (/\b(thank(s| you)|appreciate)\b/.test(lower)) {
    return {
      text: pick([
        "You're so welcome. I'm always here when you need me. 💛",
        'Anytime! Caring for you is what I do best.',
      ]),
    };
  }

  // Goodbye
  if (/\b(bye|goodbye|good night|see you|talk later)\b/.test(lower)) {
    return {
      text: pick([
        'Take good care of yourself — you deserve it. See you soon!',
        "Goodbye for now. Remember, you're doing better than you think. 💛",
      ]),
    };
  }

  // Emotional support — always checked before search so feelings never
  // get treated as keywords.
  if (
    /\b(overwhelm|stress|exhaust|tired|burn(ed|t)? ?out|sad|lonely|alone|anxious|anxiety|worried|scared|frustrat|angry|grief|grieving|guilt|cry|crying|depress|hard day|rough day|struggling)\w*\b/.test(
      lower
    )
  ) {
    return {
      text:
        pick([
          "I hear you, and what you're feeling is completely understandable. Caregiving asks so much of a person.",
          "Thank you for telling me. Those feelings are real, and they don't make you any less of a wonderful caregiver.",
        ]) +
        " Take a slow breath with me. When you're ready, some caregivers find comfort in stories from people who have felt the same way, and our resources have gentle, practical support.",
      speech:
        "I hear you, and what you're feeling is completely understandable. Caregiving asks so much of a person. Take a slow breath with me. When you're ready, you might find comfort in stories from caregivers who have felt the same way, or in our resources section.",
      actions: [
        { label: 'Stories from caregivers', to: '/chapters' },
        { label: 'Supportive resources', to: '/resources' },
        { label: 'Calming music', to: '/' },
      ],
    };
  }

  // Specific caregiving questions — answer substantively and open the real
  // page for it. Checked before generic search so "power of attorney" gets a
  // real explanation instead of a "here are some results" reply.
  const knowledge = matchKnowledge(lower);
  if (knowledge) {
    return answerFromKnowledge(knowledge);
  }

  // Recommendations / where to start
  if (/\b(recommend|suggest|where (do|should) i (start|begin)|what should i (read|do|try)|new here|first time|get(ting)? started)\b/.test(lower)) {
    return recommendChapters("I'd love to help you find a starting place.");
  }

  // Known destinations (stories, resources, flashcards, book, music, home)
  for (const dest of DESTINATIONS) {
    if (dest.pattern.test(lower)) {
      const commanded = isNavigationCommand(lower);
      if (commanded) {
        return {
          text: `Of course — taking you to ${dest.name} now. ${dest.blurb}`,
          speech: `Of course, here is ${dest.name}. ${dest.blurb}`,
          navigateTo: dest.to,
          actions: [{ label: `Open ${dest.name}`, to: dest.to }],
        };
      }
      // Mentioned but not commanded — for content words, try a real search
      // first so "stories about dementia" finds actual matches.
      const keywords = extractKeywords(lower).filter(
        (w) => !dest.pattern.test(w)
      );
      if (!keywords.length) {
        return {
          text: `${dest.blurb} Would you like to go there?`,
          actions: [{ label: `Open ${dest.name}`, to: dest.to }],
        };
      }
      break;
    }
  }

  // Content search
  const keywords = extractKeywords(lower);
  if (keywords.length) {
    try {
      let results = await searchContent(keywords.join(' '));
      if (!results && keywords.length > 1) {
        for (const word of keywords) {
          results = await searchContent(word);
          if (results) break;
        }
      }
      if (results) {
        const { actions, summary, primaryTo } = buildSearchActions(results);
        if (actions.length) {
          const lead = summary[0];
          return {
            text: `Here's what I found on that — I'm opening ${lead} for you now. There's more below if you'd like to explore.`,
            speech: `Here's what I found on that. I'm opening ${lead} for you now, and there's more on screen if you'd like to explore.`,
            actions,
            // Pull up the most relevant page right away, as Rosie should.
            navigateTo: primaryTo,
          };
        }
      }
    } catch {
      // fall through to the gentle fallback below
    }
  }

  // Gentle fallback
  return {
    text: pick([
      "I want to make sure I point you somewhere truly helpful. Could you tell me a little more? For example, you could say \"stories about patience\" or \"take me to resources\".",
      "I'm still learning, but I never want to leave you stuck. Try asking for a topic like \"communication\" — or tap one of these to explore.",
    ]),
    actions: HOME_ACTIONS,
  };
}
