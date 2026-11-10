export const DEFAULT_TECHNICAL_LEXICON: Record<string, string> = {
  PostgreSQL: 'Postgres Q L',
  Postgres: 'Postgres',
  WAL: 'W-A-L',
  CDC: 'C-D-C',
  Debezium: 'De-be-zi-um',
  Kafka: 'Kafka',
  API: 'A-P-I',
  APIs: 'A-P-I-s',
  SQL: 'S-Q-L',
  DB: 'D-B',
  HTTP: 'H-T-T-P',
  HTTPS: 'H-T-T-P-S',
  JSON: 'J-S-O-N',
  REST: 'Rest',
  RESTful: 'Rest-ful',
  OLTP: 'O-L-T-P',
  OLAP: 'O-L-A-P',
  ETL: 'E-T-L',
  UI: 'U-I',
  UX: 'U-X',
  CLI: 'C-L-I',
  SDK: 'S-D-K',
};

/**
 * Normalizes technical terms in narration text using Indonesian-friendly phonetic spelling.
 * Uses word boundaries to avoid replacing unintended substrings.
 */
export function normalizePronunciation(
  text: string,
  customLexicon?: Record<string, string>
): string {
  const lexicon = { ...DEFAULT_TECHNICAL_LEXICON, ...customLexicon };

  // Sort keys by descending length so "PostgreSQL" is matched before "Postgres"
  const keys = Object.keys(lexicon).sort((a, b) => b.length - a.length);

  let normalized = text;
  for (const key of keys) {
    // Escape special regex characters in the term
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    normalized = normalized.replace(regex, lexicon[key]);
  }

  return normalized;
}
