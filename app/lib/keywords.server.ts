import natural from "natural";

const TOP_N = 15;
const MIN_TOKEN_LENGTH = 3;

// `natural` publicly exports English stopwords (`natural.stopwords`), but its
// Spanish list lives in an internal file with no public export, so we keep a
// small Spanish stopword list here instead of depending on natural's
// internal file layout (which could move between versions without notice).
const SPANISH_STOPWORDS = [
  "a", "un", "el", "ella", "y", "sobre", "de", "la", "que", "en",
  "los", "del", "se", "las", "por", "para", "con", "no",
  "una", "su", "al", "lo", "como", "más", "pero", "sus", "le",
  "ya", "o", "porque", "cuando", "muy", "sin", "también",
  "me", "hasta", "donde", "quien", "desde", "nos", "durante", "uno",
  "ni", "contra", "ese", "eso", "mí", "qué", "otro", "él", "cual",
  "poco", "mi", "tú", "te", "ti", "sí",
];

const STOPWORDS = new Set(
  [...natural.stopwords, ...SPANISH_STOPWORDS].map((word) => word.toLowerCase()),
);

const tokenizer = new natural.WordTokenizer();

export function extractKeywords(text: string): string[] {
  const tokens: string[] = tokenizer.tokenize(text.toLowerCase()) ?? [];

  const frequency = new Map<string, number>();
  for (const token of tokens) {
    if (token.length < MIN_TOKEN_LENGTH || STOPWORDS.has(token) || /^\d+$/.test(token)) {
      continue;
    }
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([word]) => word);
}
