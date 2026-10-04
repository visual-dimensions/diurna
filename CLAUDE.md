# Diurna – Projektbrief

> **Diurna** (Projekt- und Websitename; lat. *acta diurna*, die „täglichen Bekanntmachungen“ im alten Rom). Ein interaktiver Globus, der Online-Tageszeitungen am Standort ihrer Redaktion zeigt – mit der aktuellen Schlagzeile im Pop-up. Erster Ausbau: **Europa**.

Dieses Dokument ist die verbindliche Grundlage für die Umsetzung. Bei Widersprüchen gilt: Prinzipien > Design-Richtlinien > Einzelanweisungen im Chat. Wenn etwas unklar ist, nachfragen statt raten.

---

## 1. Ziel & Abgrenzung

**Ziel:** Die Medienlandschaft der Welt sichtbar und erlebbar machen. Man dreht den Globus, tippt auf eine Stadt und liest, was dort gerade die Zeitungen aufmachen.

**Abheben von bestehenden Angeboten** (Newspaper Map, Freedom Forum Front Pages, Kiosko): Die sind funktional, aber visuell veraltet und zeigen keine aktuellen Online-Headlines. Dieses Projekt lebt vom **Wow-Effekt und von Live-Gefühl**. Das Design ist kein Beiwerk, sondern das Produkt.

**MVP-Umfang:** ca. 150–200 Medien aus ~40 europäischen Ländern (Startliste: `data/seed/europe.csv`).

**Nicht im MVP:** Übersetzung der Headlines, Nutzerkonten, Kommentare, Archiv/Zeitverlauf, Teaser/Bilder aus Feeds.

---

## 2. Prinzipien (nicht verhandelbar)

1. **Kein Backend, keine Datenbank, keine Logins.** Die Website ist statisch. Daten liegen als JSON-Dateien neben der Seite.
2. **Eine Methode für alle Medien.** Headlines kommen ausschließlich aus maschinenlesbaren Formaten, die der Verlag selbst veröffentlicht: RSS/Atom, und nur wo es kein RSS gibt, Google-News-Sitemaps (`feed_format: news_sitemap`, enthalten nur Titel, Link, Datum). Verarbeitet von *einem* generischen Skript (Parser in `scripts/feeds.py`). Kein medienspezifischer Code, keine Scraper pro Seite. Was ein Medium besonders braucht, steht als Datenfeld in `sources.json`, nicht im Code.
3. **Nimm, was die Quelle hergibt.** Gibt es einen Top-Stories-/Titelseiten-Feed → Aufmacher. Sonst → neuester Beitrag. Beides wird im UI ehrlich gekennzeichnet.
4. **Jedes Medium bleibt sichtbar.** Ist kein Feed vorhanden, blockiert die Seite den Abruf oder ist die Headline älter als 48 h, wird das Medium trotzdem angezeigt – ausgegraut, mit Link zur Startseite, ohne Headline.
5. **Rechtlich schlank:** Nur Titel + Link + Medienname speichern und anzeigen. **Keine** Teasertexte, **keine** Bilder aus Feeds, keine Volltexte. (Hintergrund: § 76f UrhG nimmt Hyperlinks und sehr kurze Auszüge aus.)
6. **Mobile ist gleichwertig, nicht Nachgedanke.** Jede Interaktion wird zuerst für Touch auf ~390 px Breite gedacht.
7. **Barrierefreiheit ist Pflicht** (WCAG 2.2 AA), inklusive einer vollwertigen Listenansicht als Alternative zum Globus.

---

## 3. Architektur

```
data/seed/europe.csv          kuratierte Startliste (von Hand gepflegt)
        │  scripts/build_sources.py   (Geokodierung Stadt → lat/lon)
        ▼
data/sources.json             Stammdaten aller Medien (ändert sich selten)
        │  scripts/discover_feeds.py  (findet Feed-URLs, einmalig/bei Bedarf)
        ▼
data/sources.json             + feed, feed_kind
        │  scripts/fetch_headlines.py (GitHub Action, alle 30 Min.)
        ▼
public/data/headlines.json    aktuelle Schlagzeilen
public/data/status.json       Feed-Gesundheit pro Quelle
        │
        ▼
Statisches Frontend (Vite)  →  Cloudflare Pages (Auto-Deploy bei Push)
```

### Stack
| Bereich | Wahl | Begründung |
|---|---|---|
| Frontend-Build | Vite + TypeScript, Vanilla oder Svelte (Entscheidung in Phase 3) | schlank, schnell, kein Framework-Overhead |
| Globus | **MapLibre GL JS ≥ v5** mit `projection: globe` | Globus, Atmosphäre, GeoJSON-Clustering, Popups nativ |
| Kartengrundlage | **Natural Earth** (Land, Grenzen, Küsten) als eigene, minimal gestylte GeoJSON-Layer | volle Kontrolle über den Look, keine Tile-Abhängigkeit, kein API-Key |
| Feed-Verarbeitung | Python 3.12, `feedparser`, `httpx` (async) | robust gegen alle RSS/Atom-Varianten und kaputte Encodings |
| Feed-Discovery | `httpx` + `selectolax` (oder BeautifulSoup) | `<link rel="alternate">` auslesen |
| Geokodierung | GeoNames `cities15000` (CC BY 4.0), lokal im Skript | Stadt-Ebene reicht; kein Online-Geocoder nötig |
| Scheduler | GitHub Actions `schedule` | kostenlos für öffentliche Repos |
| Hosting | Cloudflare Pages | Auto-Deploy, Preview-URL pro Branch |

---

## 4. Ordnerstruktur

```
/
├─ CLAUDE.md
├─ data/
│  ├─ seed/europe.csv
│  ├─ sources.json
│  └─ discovery_report.csv      (Ergebnis der Feed-Suche, zur manuellen Prüfung)
├─ scripts/
│  ├─ build_sources.py
│  ├─ discover_feeds.py
│  ├─ fetch_headlines.py
│  └─ requirements.txt
├─ public/
│  └─ data/
│     ├─ sources.json           (Kopie/Build-Output für das Frontend)
│     ├─ headlines.json
│     └─ status.json
├─ src/                          Frontend
│  ├─ main.ts
│  ├─ globe/                     MapLibre-Setup, Layer, Style, Terminator
│  ├─ ui/                        Panel, Bottom-Sheet, Live-Leiste, Suche, Listenansicht
│  ├─ styles/                    Tokens, Typografie
│  └─ data/                      Laden, Zusammenführen, Frische-Berechnung
├─ assets/geo/                   Natural-Earth-GeoJSON (vereinfacht)
└─ .github/workflows/fetch.yml
```

### Entwicklung
- Frontend: `npm install`, `npm run dev`, `npm run build`
- Python (3.12, via uv): `uv venv --python 3.12 .venv && uv pip install --python .venv -r scripts/requirements.txt`, dann `.venv/bin/python scripts/<skript>.py`

---

## 5. Datenmodell

### `sources.json` (Array)
```json
{
  "id": "derstandard",
  "name": "Der Standard",
  "country": "AT",
  "city": "Wien",
  "city_country": "AT",
  "lat": 48.2082,
  "lon": 16.3738,
  "tz": "Europe/Vienna",
  "lang": "de",
  "type": "daily",
  "tier": 1,
  "homepage": "https://www.derstandard.at",
  "feed": "https://www.derstandard.at/rss",
  "feed_format": "rss",
  "feed_kind": "top",
  "note": ""
}
```
- `type`: `daily` | `weekly` | `online` | `magazine`
- `tier`: 1 = Leitmedium (immer sichtbar), 2 = wichtig, 3 = regional/ergänzend
- `feed_format`: `rss` (RSS/Atom) | `news_sitemap` | leer (kein Feed)
- `feed_kind`: `top` (Aufmacher/Titelseite) | `latest` (neuester Beitrag) | `none` (kein Feed gefunden)
- `city_country`: Land des Redaktionsorts (Seed-Spalte, leer = `country`); nötig für Exilmedien
- `tz`: Zeitzone aus GeoNames, für die Ortszeit im Panel
- `note`: z. B. `exile` für Exilmedien (Redaktion außerhalb des Herkunftslands – Marker am tatsächlichen Redaktionsort, im Panel kennzeichnen)

### `headlines.json` (Objekt, Key = Source-ID)
```json
{
  "generated_at": "2026-10-04T19:30:00Z",
  "items": {
    "derstandard": {
      "title": "…",
      "url": "https://…",
      "published": "2026-10-04T19:12:00Z",
      "first_seen": "2026-10-04T19:30:04Z",
      "feed_updated": "2026-10-04T19:25:00Z",
      "fetched_at": "2026-10-04T19:30:04Z"
    }
  }
}
```

- `published`: Datum des Artikels laut Feed; `null`, wenn der Feed keins liefert oder es > 15 Min. in der Zukunft liegt.
- `first_seen`: erster Abruf, der diese Headline gesehen hat (Ersatz-Alter, wenn `published` fehlt).
- `feed_updated`: neuestes datiertes Item im Feed. Daran wird „stale“ gemessen – ein Aufmacher-Feed kann mit einem älteren Stück aufmachen und trotzdem lebendig sein.
- `headlines.json` wird nur neu geschrieben, wenn sich eine Headline ändert (nicht bei bloßem `fetched_at`).

### `status.json`
```json
{
  "derstandard": { "state": "ok", "last_success": "…", "fail_streak": 0, "http": 200 }
}
```
Zusätzlich `runs` / `successes` (Erfolgsquote) und `error` bei Fehlschlag.
`state`: `ok` | `stale` (neuestes Feed-Item > 48 h bzw. keine Headline) | `failing` (≥ 3 Fehler in Folge) | `dead` (≥ 10 Fehler in Folge) | `no_feed`

---

## 6. Pipeline-Regeln

### build_sources.py
- Liest `data/seed/*.csv`, geokodiert `city` + `country` über GeoNames `cities15000`.
- Treffer ohne eindeutige Zuordnung → Warnung + Zeile im Report, **nicht** raten.
- Erzeugt stabile `id`s (slug aus Name + ggf. Land).
- Zweite Stufe: nur wenn `cities15000` gar keinen Treffer hat, wird `cities500` gefragt. Mehrdeutig bleibt mehrdeutig.
- Optionale Seed-Spalten `lat`/`lon`/`tz` (manueller Override) und `id`. Report: `data/geocode_report.csv`.

### discover_feeds.py
1. Homepage laden (Timeout 15 s, ehrlicher User-Agent mit Projekt-URL).
2. Alle `<link rel="alternate" type="application/(rss|atom)+xml">` sammeln.
3. Fallback-Pfade testen: `/rss`, `/feed`, `/rss.xml`, `/feed.xml`, `/index.rss`.
4. Ranking: Feeds, deren URL oder Titel `portada|une|frontpage|front-page|topstories|top-stories|home|startseite|titelseite|hauptnachrichten|главное|prima` enthält → `top`. Sonst der allgemeinste Feed → `latest`.
5. Feed testweise parsen: mindestens 1 Item mit Titel und Link.
6. Ergebnis in `discovery_report.csv` (Quelle, gefundene Feeds, Wahl, Begründung) – **ich prüfe den Report manuell**, erst dann wird `sources.json` aktualisiert.
   - Ergänzung: Liefern Fallback-Pfade oder „RSS“-Links der Startseite eine HTML-Seite, wird sie als RSS-Übersichtsseite gelesen (`chosen_via = overview page`, im Report mit `CHECK` markiert).
   - Von Hand recherchierte Feeds stehen in `data/feed_overrides.csv` (`id, feed, feed_kind, note`); sie werden bei jedem Lauf mitgeprüft und gewinnen, solange sie gültig sind.
   - Letzte Stufe: Google-News-Sitemaps aus der `robots.txt`.
   - Ehrlicher User-Agent, keine Umgehung von Bot-Schutz. Blockierte Medien bleiben ausgegraut.
   - Korrekturen direkt im Report (`chosen_feed`, `feed_kind`), dann `discover_feeds.py --apply` → schreibt `data/sources.json` + `public/data/sources.json`. `--only id1,id2` für Teil-Läufe.

### fetch_headlines.py
- Async, max. 10 parallele Requests, Timeout 10 s, 1 Retry.
- **Conditional GET** (ETag / Last-Modified merken, im Repo in `data/http_cache.json`).
- Erstes Item = Headline. HTML-Tags und Entities aus dem Titel entfernen, Whitespace normalisieren. Titel nicht kürzen (Kürzen ist Sache des UI).
- Items, deren Titel offensichtlich Ticker/Service sind, optional überspringen (Muster in `sources.json` als `skip_pattern`, nicht im Code).
- Kein Erfolg → alte Headline behalten, `fail_streak` erhöhen. Headline > 48 h → `stale`.
- Laufzeit-Ziel: < 2 Min. für 200 Quellen.
- Schreibt `headlines.json` und `status.json` nur, wenn sich etwas geändert hat.

### GitHub Action (`fetch.yml`)
- `schedule: cron: '*/30 * * * *'` + `workflow_dispatch` für manuelle Läufe.
- Python installieren, `fetch_headlines.py` ausführen, bei Änderungen committen (`[skip ci]` nicht verwenden, damit Pages deployt).
- Hinweis: GitHub-Cron kann sich 5–30 Min. verspäten – akzeptabel.
- Später optional: statt Commit direkt per `wrangler pages deploy` hochladen (vermeidet Commit-Flut). Für den MVP reicht Commit.

---

## 7. Design & UI – der Wow-Effekt

### Leitidee: **„Die Welt bei Nacht, in der die Redaktionen leuchten“**
Ein dunkler, ruhiger Globus im All. Jede Redaktion ist ein Lichtpunkt. Je frischer die Schlagzeile, desto heller der Punkt. Neue Schlagzeilen „zünden“ sichtbar. Der Globus fühlt sich lebendig an, ohne laut zu sein.

### Visuelle Sprache
- **Hintergrund:** tiefes Blauschwarz (`#07090F` → `#0B0E14`), dezente Sterne oder nur feines Rauschen – kein Kitsch.
- **Globus:** Landflächen sehr dunkel (`#141925`), Küsten und Grenzen als Haarlinien mit geringer Deckkraft. Keine Kartenbeschriftungen auf Weltebene; Länder-/Städtenamen erst beim Zoom, sehr zurückhaltend.
- **Atmosphäre:** MapLibre-Atmosphäre aktivieren, kühler Rand-Glow.
- **Tag-Nacht-Grenze in Echtzeit:** Die Nachtseite der Erde ist etwas dunkler, der Terminator weich. Das ist für Nachrichten inhaltlich sinnvoll (wo ist gerade Morgen, wo Nacht) und sieht großartig aus.
- **Marker:** weiche Lichtpunkte mit Glow.
  - Frische < 1 h: hell, warmes Weiß/Amber, einmaliger Puls-Ring beim Erscheinen.
  - 1–12 h: mittel. 12–48 h: gedimmt.
  - Keine Headline: kleiner Hohlkreis, grau.
  - Cluster (Stadt mit mehreren Medien): größerer Punkt mit Zahl, gleiche Lichtlogik (hellste Headline zählt).
- **Farben (Tokens):** `--bg`, `--land`, `--line`, `--glow-fresh` (Amber ~`#FFB347`), `--glow-mid`, `--paper` (warmes Papierweiß `#F3EBDD` für Headlines), `--muted`, `--accent-live` (sparsam).
- **Typografie:** Headlines in einer charaktervollen Zeitungs-Serif (z. B. *Newsreader* oder *Fraunces*), UI in einer klaren Grotesk (z. B. *Inter* oder *Geist*). Fallback-Stack mit *Noto Serif / Noto Sans* für Kyrillisch und Griechisch – unbedingt mit echten Headlines aus UA, RS, BG, GR testen. Mediennamen in Kapitälchen oder Versalien mit Sperrung – der Zeitungskopf-Moment.

### Kerninteraktionen
1. **Intro (einmal pro Sitzung, < 3 s, überspringbar):** Kamera fliegt aus dem All auf Europa; die Lichtpunkte gehen nacheinander an, von Ost nach West wie ein Sonnenaufgang. Danach sofort bedienbar.
2. **Stadt antippen** → Kamera zentriert weich → Panel öffnet sich mit allen Medien dieser Stadt:
   - Mediename (Kopfzeile-Stil), Kennzeichnung „Aufmacher“ oder „Neuester Beitrag“, Alter („vor 12 Min.“), Ortszeit der Stadt.
   - Headline groß in der Serif, mit `lang`-Attribut und `dir="auto"`.
   - Link „Zum Artikel ↗“ und „Zur Startseite“.
   - Bei mehreren Medien: horizontal durchwischen (Mobile) bzw. Liste (Desktop).
3. **Live-Leiste:** Unten eine schmale, ruhige Leiste mit den zuletzt hereingekommenen Schlagzeilen („Gerade eben in Lissabon: …“). Antippen → Globus fliegt hin. Pausiert bei Hover/Fokus, bei `prefers-reduced-motion` statisch.
4. **Ambient-Modus (optional, Umschalter):** Globus dreht langsam; neue Schlagzeilen erscheinen kurz als schwebende Label an ihrem Punkt. Gedacht als „Bildschirmschoner der Weltnachrichten“ – das ist der Screenshot-/Demo-Moment.
5. **Suche & Filter:** schwebende Pill oben; Suche nach Medium, Stadt, Land; Filter Sprache, Land, Tier, „nur mit Headline“.
6. **Listenansicht:** Umschalter Globus ↔ Liste (Land → Stadt → Medium). Vollständig per Tastatur und Screenreader nutzbar, gleiche Daten.

### Mobile
- Globus füllt den Screen. Ein Finger dreht, zwei Finger zoomen. Kein Scroll-Konflikt mit der Seite.
- **Bottom Sheet statt Popup** mit drei Rastpunkten: *Peek* (Stadtname + eine Headline), *halb* (Medienliste), *voll*.
- Trefferfläche jedes Markers mindestens 44 × 44 px (unsichtbare Hit-Area größer als der sichtbare Punkt).
- Suche als Pill oben, Live-Leiste über dem Sheet bzw. im Peek integriert.
- Safe-Area-Insets (Notch, Home-Indicator) beachten.

### Bewegung
- Alle Kamerafahrten mit Easing, 600–1200 ms. Nichts springt.
- `prefers-reduced-motion`: kein Intro-Flug, kein Auto-Rotate, keine Pulse, Kamera springt ohne Animation.

### Barrierefreiheit
- Kontraste AA, auch für gedimmte Marker-Labels und Text im Panel.
- Fokus-Reihenfolge logisch; Panel/Sheet als Dialog mit Fokusfalle und Escape.
- Jede Headline mit korrektem `lang`. Screenreader-Text für Marker-Zustände („keine aktuelle Schlagzeile“).
- Globus-Canvas mit `aria-label` und Hinweis auf die Listenansicht.

### Performance-Budget
- Erster sinnvoller Frame < 2,5 s auf Mittelklasse-Smartphone (4G).
- 60 fps beim Drehen auf aktuellen Geräten, flüssig (≥ 30 fps) auf älteren.
- `devicePixelRatio` auf max. 2 begrenzen. Natural-Earth-Geometrie vereinfacht (110m/50m).
- JS-Bundle (ohne MapLibre) < 80 KB gzip. Daten-JSON gzip < 100 KB.

---

## 8. Phasen & Akzeptanzkriterien

### Phase 0 – Setup
- Repo, Vite-Projekt, Python-Umgebung, leere Action.
- ✅ `npm run dev` zeigt leere Seite; Action läuft manuell durch.

### Phase 1 – Daten
- `build_sources.py` + `discover_feeds.py` auf `europe.csv` anwenden.
- ✅ `sources.json` mit allen Startmedien, Koordinaten auf Stadtebene.
- ✅ `discovery_report.csv` liegt vor; ich habe ihn geprüft; Anteil `top` / `latest` / `none` ist bekannt.

### Phase 2 – Abruf
- `fetch_headlines.py` + Action alle 30 Min.
- ✅ Eine Woche Laufbetrieb: Erfolgsquote pro Quelle in `status.json` sichtbar; Liste der blockierten Medien bekannt.

### Phase 3 – Design-Spike (vor der eigentlichen Umsetzung!)
- Globus mit Beispieldaten, nur Look & Feel: Farben, Atmosphäre, Terminator, Marker-Glow, Typografie im Panel, Bottom Sheet auf Mobile.
- ✅ Ich habe Look & Feel auf Desktop **und** Handy abgenommen, bevor Funktionen dazukommen.

### Phase 4 – Kernfunktionen
- Echte Daten, Clustering, Panel/Sheet, Frische-Logik, ausgegraute Medien, Suche & Filter, Listenansicht.
- ✅ Alle Medien erreichbar per Touch, Maus, Tastatur.

### Phase 5 – Wow-Schicht
- Intro, Puls bei neuen Headlines, Live-Leiste, Ambient-Modus.
- ✅ Reduced-Motion-Variante funktioniert vollständig.

### Phase 6 – Qualität & Launch
- Accessibility-Audit (axe + manuell mit VoiceOver/TalkBack), Lighthouse mobil, Test auf echtem iPhone und Android.
- Impressum/Info-Seite: Was ist das, woher kommen die Daten, Kennzeichnung „Aufmacher“ vs. „Neuester Beitrag“, Kontakt für Medien, die nicht gelistet werden wollen.
- ✅ Deploy auf Cloudflare Pages mit eigener Domain.

---

## 9. Offene Entscheidungen

- ~~Projektname~~ → **Diurna** (entschieden). Domain noch offen.
- Abgrenzung: Wochenzeitungen, Nachrichtenmagazine, reine Online-Medien dabei? (Startliste enthält einzelne, über `type` gekennzeichnet und filterbar.)
- Exilmedien (z. B. russische/belarussische Redaktionen in Riga oder Vilnius): am Redaktionsort zeigen und kennzeichnen – so in der Startliste vorgesehen.
- Transkontinentale Länder (Georgien, Armenien, Aserbaidschan) und Russland jenseits Moskaus: später.
- Vanilla TS oder Svelte fürs Frontend (nach dem Design-Spike entscheiden).

---

## 10. Nicht tun

- Keine medienspezifischen Scraper oder Sonderlogik im Code.
- Keine Teaser, Bilder, Volltexte aus Feeds speichern oder anzeigen.
- Keine Tracking-Cookies; falls Analytics, dann cookielos.
- Keine Koordinaten raten – lieber Warnung im Report.
- Kein generisches „Dashboard“-Design mit Standard-Map-Kacheln und Default-Popups. Wenn es aussieht wie ein Template, ist es falsch.
