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
): { actions: RosieAction[]; summary: string[] } {
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

  return { actions: actions.slice(0, 5), summary: summary.slice(0, 5) };
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
        const { actions, summary } = buildSearchActions(results);
        if (actions.length) {
          return {
            text: `I found a few things that might help — ${summary.join(', ')}. Tap anything below to open it.`,
            speech: `I found a few things that might help, including ${summary[0]}. Tap anything on screen to open it.`,
            actions,
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
