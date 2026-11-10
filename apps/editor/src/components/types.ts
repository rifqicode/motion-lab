export interface Status {
  codex: {connected: boolean; authenticated: boolean; accountLabel?: string; error?: string};
  antigravity?: {connected: boolean; authenticated: boolean; model?: string; error?: string};
  runner: {available: boolean; reason?: string};
}

export interface SourceFile {
  path: string;
  content: string;
}

export type ReviewTab = 'comments' | 'versions' | 'source';
