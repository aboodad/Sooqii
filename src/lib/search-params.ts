export type RawParams = Record<string, string | string[] | undefined>;
export const PER_PAGE = 24;

export function readParams(sp: RawParams) {
  const s = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const n = (k: string) => { const v = Number(s(k)); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const page = Math.min(Math.max(1, Math.floor(n('page') ?? 1)), 200);
  return {
    q: s('q')?.slice(0, 120), sort: s('sort'), min: n('min'), max: n('max'), inStock: s('stock') === '1', page,
    raw: { q: s('q'), sort: s('sort'), min: s('min'), max: s('max'), stock: s('stock') },
  };
}
