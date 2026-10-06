/**
 * Chinese, Japanese and Korean headline fonts, loaded only when needed.
 *
 * Fonts for smaller scripts (Arabic, Hebrew, Indic, Southeast Asian) are declared
 * statically in main.ts: their @font-face lists are tiny, and unicode-range keeps
 * the font files themselves unloaded until such text appears. A CJK family instead
 * declares 100+ subsets – 25–35 KB gzip of CSS per family – so its stylesheet is
 * imported only when a headline in that language is about to be shown. Until it
 * arrives, the system's CJK serif renders the text (font-display: swap).
 */

const FAMILIES = {
  sc: () => import('@fontsource-variable/noto-serif-sc/wght.css'),
  tc: () => import('@fontsource-variable/noto-serif-tc/wght.css'),
  jp: () => import('@fontsource-variable/noto-serif-jp/wght.css'),
  kr: () => import('@fontsource-variable/noto-serif-kr/wght.css'),
} as const;

const requested = new Set<keyof typeof FAMILIES>();

/** Which CJK family a `lang` code needs: zh → simplified, zh-Hant → traditional. */
function familyFor(lang: string): keyof typeof FAMILIES | null {
  const l = lang.toLowerCase();
  if (l === 'zh-hant' || l.startsWith('zh-hant-') || l === 'zh-tw' || l === 'zh-hk' || l === 'yue') return 'tc';
  if (l === 'zh' || l.startsWith('zh-')) return 'sc';
  if (l === 'ja') return 'jp';
  if (l === 'ko') return 'kr';
  return null;
}

/** Call before rendering a headline in `lang`; loads its CJK font stylesheet once. */
export function ensureScriptFont(lang: string): void {
  const family = familyFor(lang);
  if (!family || requested.has(family)) return;
  requested.add(family);
  FAMILIES[family]().catch(() => requested.delete(family)); // retry on the next headline
}
