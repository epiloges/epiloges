/**
 * Generates a gift-card code nobody can guess.
 *
 * Codes used to be whatever the admin typed — "GIFT50", "GIFT100" — and a gift card is a
 * bearer instrument: anyone who can type the code can spend the balance. Four groups of
 * four from a 32-symbol alphabet (no 0/O/1/I, which look alike when read off a card) is
 * 160 bits of "nobody is guessing this", and still fits on a gift card and in a text.
 *
 * Client-safe on purpose (Web Crypto, no Node import): the "Generate" button in the form
 * uses it, and so does the server when a submitted code is blank.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateGiftCardCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const symbols = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);
  return [0, 4, 8, 12].map((start) => symbols.slice(start, start + 4).join("")).join("-");
}

/** True for codes that came out of `generateGiftCardCode` (or were typed in that shape). */
export function looksGenerated(code: string): boolean {
  return /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(code);
}
