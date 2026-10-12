/**
 * Replies that need no model: a greeting, a thank-you, and the three phrases that only mean "take me to the
 * quotation form". Deliberately small. Anything with a real question in it goes to the assistant.
 */
export type LocalReply = { kind: 'greeting' | 'thanks' | 'quote'; text: string; action?: 'quote' };

const GREETING = /^(?:hi+|hii+|hello+|hey+|heya|hiya|greetings|good (?:morning|afternoon|evening|day))(?: (?:there|team|assistant|all))?$/;
const THANKS = /^(?:(?:ok(?:ay)?|great|cool|perfect|got it|alright)(?: (?:thanks|thank you))?|(?:thanks|thank you|thx|ty)(?: (?:a lot|so much|very much|again|a ton))?)$/;
const QUOTE = /^(?:(?:please )?(?:get|request|send|need|want|i want|i need) (?:a |an |the )?(?:quote|quotation|demo|demonstration)|quote|quotation|a quote|a quotation|demo|(?:request|book) (?:a |an )?(?:quote|quotation|demo)|(?:get|request) (?:a )?quote(?: please)?)$/;

export const GREETING_REPLY =
  'Hello! I can help you explore STM Digital Library, find academic content, understand subscriptions, or request a quotation. What would you like to know?';
const THANKS_REPLY = "You're welcome! Is there anything else I can help you with: content, subscriptions, or a quotation?";
const QUOTE_REPLY = 'You can request a quotation or a demo from the Get a quote tab. It takes about a minute, and our team will reply during business hours.';

/** Lower-case, no punctuation or emoji, single spaces. */
const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export function localReply(message: string): LocalReply | null {
  const m = normalise(message);
  if (!m || m.length > 40) return null;
  if (GREETING.test(m)) return { kind: 'greeting', text: GREETING_REPLY };
  if (THANKS.test(m)) return { kind: 'thanks', text: THANKS_REPLY };
  if (QUOTE.test(m)) return { kind: 'quote', text: QUOTE_REPLY, action: 'quote' };
  return null;
}
