const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto', style: 'short' });
const regionNames = new Intl.DisplayNames(['de'], { type: 'region' });

export function relativeAge(minutes: number): string {
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return rtf.format(-Math.round(minutes), 'minute');
  if (minutes < 48 * 60) return rtf.format(-Math.round(minutes / 60), 'hour');
  return rtf.format(-Math.round(minutes / 1440), 'day');
}

export function localTime(tz: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(date);
  } catch {
    return '';
  }
}

export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
