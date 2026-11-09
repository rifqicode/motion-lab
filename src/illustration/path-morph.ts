// Morph only explicit M/L/C/Q/Z commands with identical topology. No implicit repeats or arcs.
export const parseMorphPath = (d: string) => {
  const tokens = d.match(/[MLCQZmlcqz]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? [];
  if (d.replace(/[MLCQZmlcqz]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi, '').replace(/[\s,]/g, ''))
    throw new Error('Unsupported morph path syntax');
  const arity: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };
  if (!tokens.length || tokens[0]?.toUpperCase() !== 'M')
    throw new Error('Morph path must start with M');
  const commands: string[] = [],
    values: number[] = [];
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++],
      count = arity[command.toUpperCase()];
    if (count === undefined) throw new Error('Use explicit morph commands');
    commands.push(command);
    for (let j = 0; j < count; j++) {
      const v = Number(tokens[i++]);
      if (!Number.isFinite(v)) throw new Error('Malformed morph coordinates');
      values.push(v);
    }
  }
  return { commands, values };
};
export const compatiblePaths = (from: string, to: string) => {
  const a = parseMorphPath(from),
    b = parseMorphPath(to);
  if (a.commands.join('') !== b.commands.join('') || a.values.length !== b.values.length)
    throw new Error('Morph paths need matching command topology');
  return { a, b };
};
export const morphPath = (from: string, to: string, p: number) => {
  const { a, b } = compatiblePaths(from, to);
  let index = 0;
  const arity: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };
  return a.commands
    .map(
      (c) =>
        `${c} ${Array.from({ length: arity[c.toUpperCase()] }, () => {
          const i = index++;
          return a.values[i] + (b.values[i] - a.values[i]) * p;
        }).join(' ')}`,
    )
    .join(' ');
};
