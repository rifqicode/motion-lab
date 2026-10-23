export interface ThemeTokens {
  id: string;
  name: string;
  background: string;
  surface: string;
  surfaceBorder: string;
  surfaceText: string;
  secondaryText: string;
  accent: string;
  accentSecondary: string;
  edgeColor: string;
  edgeActiveColor: string;
  particleColor: string;
  glowColor: string;
  fontFamily: string;
  nodeRadius: number;
  strokeWidth: number;
  connectorStyle: 'curved' | 'orthogonal' | 'sketch';
  badgeBg: string;
  badgeText: string;
  subtitleBg: string;
  subtitleText: string;
  subtitleHighlight: string;
}

export const midnightTechTheme: ThemeTokens = {
  id: 'midnight-tech',
  name: 'Midnight Tech',
  background: '#0B0F19',
  surface: '#161F30',
  surfaceBorder: '#2A3B5C',
  surfaceText: '#F8FAFC',
  secondaryText: '#94A3B8',
  accent: '#38BDF8', // Cyan
  accentSecondary: '#A855F7', // Purple
  edgeColor: '#334155',
  edgeActiveColor: '#38BDF8',
  particleColor: '#F59E0B', // Amber
  glowColor: 'rgba(56, 189, 248, 0.4)',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  nodeRadius: 16,
  strokeWidth: 3,
  connectorStyle: 'curved',
  badgeBg: '#1E293B',
  badgeText: '#38BDF8',
  subtitleBg: 'rgba(15, 23, 42, 0.85)',
  subtitleText: '#F8FAFC',
  subtitleHighlight: '#38BDF8',
};

export const cleanLightTheme: ThemeTokens = {
  id: 'clean-light',
  name: 'Clean Light',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceBorder: '#E2E8F0',
  surfaceText: '#0F172A',
  secondaryText: '#64748B',
  accent: '#2563EB', // Blue
  accentSecondary: '#7C3AED', // Violet
  edgeColor: '#CBD5E1',
  edgeActiveColor: '#2563EB',
  particleColor: '#EA580C', // Orange
  glowColor: 'rgba(37, 99, 235, 0.25)',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  nodeRadius: 14,
  strokeWidth: 2.5,
  connectorStyle: 'curved',
  badgeBg: '#EEF2FF',
  badgeText: '#4338CA',
  subtitleBg: 'rgba(255, 255, 255, 0.9)',
  subtitleText: '#0F172A',
  subtitleHighlight: '#2563EB',
};

export const handDrawnTheme: ThemeTokens = {
  id: 'hand-drawn',
  name: 'Hand Drawn',
  background: '#18181B', // Chalkboard dark
  surface: '#27272A',
  surfaceBorder: '#71717A',
  surfaceText: '#FAFAFA',
  secondaryText: '#A1A1AA',
  accent: '#FACC15', // Chalk yellow
  accentSecondary: '#34D399', // Chalk mint
  edgeColor: '#52525B',
  edgeActiveColor: '#FACC15',
  particleColor: '#FB7185', // Chalk rose
  glowColor: 'rgba(250, 204, 21, 0.3)',
  fontFamily: '"Comic Sans MS", "Caveat", cursive, sans-serif',
  nodeRadius: 8,
  strokeWidth: 3.5,
  connectorStyle: 'sketch',
  badgeBg: '#3F3F46',
  badgeText: '#FACC15',
  subtitleBg: 'rgba(39, 39, 42, 0.9)',
  subtitleText: '#FAFAFA',
  subtitleHighlight: '#FACC15',
};

export const themes: Record<string, ThemeTokens> = {
  'midnight-tech': midnightTechTheme,
  'clean-light': cleanLightTheme,
  'hand-drawn': handDrawnTheme,
};

export function getTheme(id: string): ThemeTokens {
  return themes[id] || midnightTechTheme;
}
