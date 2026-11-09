export const styles = {
  education: {
    background: '#fff4dc',
    ink: '#292c40',
    muted: '#655d69',
    coral: '#ee7256',
    teal: '#267e78',
    gold: '#efb84f',
    coffee: '#75432e',
    cream: '#ffd48b',
    paper: '#fffaf0',
    shadow: '#e6caaa',
  },
  botanical: {
    background: '#edf2de',
    ink: '#253c31',
    muted: '#5b6e58',
    coral: '#d88560',
    teal: '#427866',
    gold: '#dba64b',
    coffee: '#6b4931',
    cream: '#f4d59c',
    paper: '#faf5e5',
    shadow: '#c7d1b4',
  },
  midnight: {
    background: '#22273a',
    ink: '#fff1d7',
    muted: '#c5bda9',
    coral: '#f29578',
    teal: '#6bb7a1',
    gold: '#f1c15f',
    coffee: '#9f6548',
    cream: '#ffe0a3',
    paper: '#e4d9c2',
    shadow: '#14192a',
  },
} as const;
export type Palette = (typeof styles)[keyof typeof styles];
export const color = (value: string, palette: Palette) =>
  value.startsWith('$') ? (palette[value.slice(1) as keyof Palette] ?? value) : value;
