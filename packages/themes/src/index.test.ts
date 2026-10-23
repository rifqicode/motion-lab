import { describe, it, expect } from 'vitest';
import { getTheme, themes, midnightTechTheme, cleanLightTheme, handDrawnTheme } from './index.js';

describe('Themes Registry & Tokens', () => {
  it('exports midnight-tech, clean-light, and hand-drawn presets', () => {
    expect(themes['midnight-tech']).toBeDefined();
    expect(themes['clean-light']).toBeDefined();
    expect(themes['hand-drawn']).toBeDefined();
  });

  it('provides all mandatory visual tokens for each theme', () => {
    const themeList = [midnightTechTheme, cleanLightTheme, handDrawnTheme];
    for (const theme of themeList) {
      expect(theme.background).toBeTruthy();
      expect(theme.surface).toBeTruthy();
      expect(theme.accent).toBeTruthy();
      expect(theme.fontFamily).toBeTruthy();
      expect(theme.strokeWidth).toBeGreaterThan(0);
      expect(theme.nodeRadius).toBeGreaterThan(0);
      expect(theme.connectorStyle).toBeTruthy();
    }
  });

  it('falls back to midnight-tech on unknown theme id', () => {
    const theme = getTheme('unknown-theme');
    expect(theme.id).toBe('midnight-tech');
  });
});
