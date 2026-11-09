import { nodeSchema, type IllustrationNode } from './schema';
// Defaults are applied at the authoring boundary; runtime JSON uses the same schema.
export const node = (
  input: Partial<IllustrationNode> & Pick<IllustrationNode, 'id' | 'kind'>,
): IllustrationNode => nodeSchema.parse(input);
export const group = (
  id: string,
  children: IllustrationNode[],
  props: Partial<IllustrationNode> = {},
) => node({ id, kind: 'group', ...props, children });
export const path = (id: string, d: string, fill: string, props: Partial<IllustrationNode> = {}) =>
  node({ id, kind: 'path', d, fill, ...props });
export const ellipse = (
  id: string,
  rx: number,
  ry: number,
  fill: string,
  props: Partial<IllustrationNode> = {},
) => node({ id, kind: 'ellipse', rx, ry, fill, ...props });
export const rect = (
  id: string,
  width: number,
  height: number,
  fill: string,
  props: Partial<IllustrationNode> = {},
) => node({ id, kind: 'rect', width, height, rx: 20, fill, ...props });
export const asset = (id: string, name: string, props: Partial<IllustrationNode> = {}) =>
  node({ id, kind: 'asset', asset: name, ...props });
