import type { Medium } from '../data/load';
import { countryName, escapeHtml, missingReason, relativeAge } from './format';

/** Exile and state-ownership labels; state ownership links to its evidence. */
function noteLine(m: Medium): string {
  if (m.note === 'exile') return `<p class="card__note">In exile · from ${escapeHtml(countryName(m.country))}</p>`;
  if (m.note === 'state') {
    const source = m.note_source
      ? ` · <a class="card__notesource" href="${escapeHtml(m.note_source)}" target="_blank" rel="noopener">Source<span class="sr-only"> for the state ownership of ${escapeHtml(m.name)}</span></a>`
      : '';
    return `<p class="card__note card__note--state">State-owned${source}</p>`;
  }
  return '';
}

/** English machine translation below the original, clearly labelled. */
function translation(m: Medium): string {
  const en = m.headline?.translations?.en;
  if (!en || m.lang === 'en') return '';
  return `<p class="card__translation"><span class="card__mt">Machine-translated</span> <span lang="en">${escapeHtml(en)}</span></p>`;
}

/**
 * One medium: masthead, kind of headline, age, headline in the original
 * language, links. Shared by the city panel and the list view.
 * `headingLevel` keeps the document outline correct in both places.
 */
export function mediumCard(m: Medium, headingLevel = 3): string {
  const name = escapeHtml(m.name);
  const h = `h${headingLevel}`;
  const exile = noteLine(m);
  const home = `<a class="card__link card__link--quiet" href="${escapeHtml(m.homepage)}" target="_blank" rel="noopener">Homepage<span class="sr-only"> of ${name}</span></a>`;

  if (!m.headline) {
    return `<li class="card card--l0" data-medium="${escapeHtml(m.id)}">
      <${h} class="card__masthead">${name}</${h}>
      ${exile}
      <p class="card__empty">${missingReason(m)}</p>
      <p class="card__links">${home}</p>
    </li>`;
  }

  const kind = m.feed_kind === 'top' ? 'Top story' : 'Latest';
  const kindHint = m.feed_kind === 'top' ? 'The lead story on the front page' : 'The most recent article – the source offers no front-page feed';
  const age = m.ageMin !== null ? `<span aria-hidden="true">·</span> <span>${relativeAge(m.ageMin)}</span>` : '';
  return `<li class="card card--l${m.level}" data-medium="${escapeHtml(m.id)}">
    <${h} class="card__masthead">${name}</${h}>
    ${exile}
    <p class="card__meta"><span class="card__kind" title="${kindHint}">${kind}</span> ${age}</p>
    <p class="card__headline" lang="${escapeHtml(m.lang)}" dir="auto">${escapeHtml(m.headline.title)}</p>
    ${translation(m)}
    <p class="card__links">
      <a class="card__link" href="${escapeHtml(m.headline.url)}" target="_blank" rel="noopener">Read article<span class="sr-only"> at ${name}</span> <span aria-hidden="true">↗</span></a>
      ${home}
    </p>
  </li>`;
}
