# Diurna – Projektbrief

> **Diurna** (Projekt- und Websitename; lat. *acta diurna*, die „täglichen Bekanntmachungen“ im alten Rom). Ein interaktiver Globus, der Online-Tageszeitungen am Standort ihrer Redaktion zeigt – mit der aktuellen Schlagzeile im Pop-up. Erster Ausbau: **Europa**.

Dieses Dokument ist die verbindliche Grundlage für die Umsetzung. Bei Widersprüchen gilt: Prinzipien > Design-Richtlinien > Einzelanweisungen im Chat. Wenn etwas unklar ist, nachfragen statt raten.

---

## 1. Ziel & Abgrenzung

**Ziel:** Die Medienlandschaft der Welt sichtbar und erlebbar machen. Man dreht den Globus, tippt auf eine Stadt und liest, was dort gerade die Zeitungen aufmachen.

**Abheben von bestehenden Angeboten** (Newspaper Map, Freedom Forum Front Pages, Kiosko): Die sind funktional, aber visuell veraltet und zeigen keine aktuellen Online-Headlines. Dieses Projekt lebt vom **Wow-Effekt und von Live-Gefühl**. Das Design ist kein Beiwerk, sondern das Produkt.

**MVP-Umfang:** ca. 150–200 Medien aus ~40 europäischen Ländern (Startliste: `data/seed/europe.csv`).

**Nicht im MVP:** Nutzerkonten, Kommentare, Archiv/Zeitverlauf, Teaser/Bilder aus Feeds.

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
        │  scripts/fetch_headlines.py (GitHub Action, alle 30 Min., Takt nach Tier)
        │  scripts/translate_headlines.py (neue Headlines → Englisch, offenes Modell)
        ▼
public/data/headlines.json    aktuelle Schlagzeilen   ┐ Pipeline-Zustand,
public/data/status.json       Feed-Gesundheit         │ liegt auf dem Branch `data`
data/http_cache.json          ETag/Last-Modified      ┘ (ein Commit, ohne Historie)
        │  scripts/build_frontend_data.py
        ▼
public/data/index.json        alles für Globus/Suche/Filter, ohne Titel (kompakt)
public/data/countries/XX.json Titel, Links, Übersetzungen pro Redaktionsland (bei Bedarf geladen)
public/data/latest.json       neueste Headlines für Live-Leiste und Ambient-Modus
        │
        ▼
Statisches Frontend (Vite)  →  Cloudflare Pages (Direct Upload per wrangler aus der Action)
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
│  ├─ discovery_report.csv      (Ergebnis der Feed-Suche, zur manuellen Prüfung)
│  └─ feed_overrides.csv        (von Hand recherchierte Feeds)
├─ scripts/
│  ├─ build_sources.py
│  ├─ discover_feeds.py
│  ├─ fetch_headlines.py
│  ├─ import_wikidata.py, refill_regional.py, check_feeds.py   (weltweiter Ausbau)
│  └─ requirements.txt
├─ public/
│  └─ data/                     generiert, nicht in `main` – kommt vom Branch `data` (`npm run data`)
├─ src/                          Frontend
│  ├─ main.ts
│  ├─ globe/                     MapLibre-Setup, Layer, Style, Terminator
│  ├─ ui/                        Panel, Bottom-Sheet, Live-Leiste, Suche, Listenansicht
│  ├─ styles/                    Tokens, Typografie
│  └─ data/                      Laden, Zusammenführen, Frische-Berechnung
├─ about/index.html              Info-/Impressum-Seite
├─ assets/geo/                   Natural-Earth-GeoJSON (110m für den ersten Frame, 50m nachgeladen)
├─ public/_headers               Sicherheits-Header (CSP) und Caching für Cloudflare Pages
└─ .github/workflows/            fetch.yml (alle 30 Min.), deploy.yml (Build + Upload)
```

### Entwicklung
- Frontend: `npm install`, `npm run data` (aktuelle Daten vom Branch `data` holen), `npm run dev`, `npm run build`
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
  "note": "",
  "note_source": ""
}
```
- `type`: `daily` | `weekly` | `online` | `magazine`
- `tier`: 1 = Leitmedium (immer sichtbar), 2 = wichtig, 3 = regional/ergänzend
- `feed_format`: `rss` (RSS/Atom) | `news_sitemap` | leer (kein Feed)
- `feed_kind`: `top` (Aufmacher/Titelseite) | `latest` (neuester Beitrag) | `none` (kein Feed gefunden)
- `city_country`: Land des Redaktionsorts (Seed-Spalte, leer = `country`); nötig für Exilmedien
- `tz`: Zeitzone aus GeoNames, für die Ortszeit im Panel
- `note`: z. B. `exile` für Exilmedien (Redaktion außerhalb des Herkunftslands – Marker am tatsächlichen Redaktionsort, im Panel kennzeichnen); `state` für staatseigene/-kontrollierte Medien (siehe Abschnitt 10), Beleg in `note_source` (URL)

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
- Async, max. 24 parallele Requests, höchstens 2 pro Host, Timeout 10 s, 1 Retry.
- Takt nach Tier: Tier 1 alle 30 Min., Tier 2 stündlich, Tier 3 alle 150 Min. (`INTERVAL_BY_TIER`); pro Medium überschreibbar mit `interval` (Minuten) in `sources.json`. `FETCH_ALL=1` bzw. Workflow-Eingabe `fetch_all` holt alles.
- **Conditional GET** (ETag / Last-Modified merken, im Repo in `data/http_cache.json`).
- Erstes Item = Headline. HTML-Tags und Entities aus dem Titel entfernen, Whitespace normalisieren. Titel nicht kürzen (Kürzen ist Sache des UI).
- Items, deren Titel offensichtlich Ticker/Service sind, optional überspringen (Muster in `sources.json` als `skip_pattern`, nicht im Code).
- Kein Erfolg → alte Headline behalten, `fail_streak` erhöhen. Headline > 48 h → `stale`.
- Laufzeit-Ziel: < 2 Min. für 200 Quellen.
- Schreibt `headlines.json` und `status.json` nur, wenn sich etwas geändert hat.

### GitHub Action (`fetch.yml`)
- `schedule: cron: '7,37 * * * *'` (alle 30 Min., bewusst nicht zu :00/:30 – dort lässt GitHub Läufe oft ausfallen) + `workflow_dispatch` für manuelle Läufe.
- Zustand vom Branch `data` holen (`scripts/pull_data.sh`), `fetch_headlines.py` → `translate_headlines.py` → `build_frontend_data.py`, Ergebnis als **ein Commit ohne Historie** per force-push auf `data` (hält das Repo klein).
- Danach ruft `fetch.yml` `deploy.yml` auf: `npm run build` + `wrangler pages deploy dist` (Direct Upload, keine Git-Integration → zählt nicht gegen das Pages-Build-Limit). `deploy.yml` läuft außerdem bei jedem Code-Push.
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (ohne sie wird nur gebaut). Pages-Projektname: `diurna`.
- Hinweis: GitHub-Cron kann sich 5–30 Min. verspäten – akzeptabel.

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
3. **Live-Leiste:** Unten eine schmale, ruhige Leiste mit den zuletzt hereingekommenen Schlagzeilen („Gerade eben in Lissabon: …“). Antippen → Globus fliegt hin. Pausiert bei Hover/Fokus, bei `prefers-reduced-motion` statisch. Eigener Pause-Knopf (WCAG 2.2.2).
4. **Ambient-Modus (optional, Umschalter):** Globus dreht langsam; neue Schlagzeilen erscheinen kurz als schwebende Label an ihrem Punkt. Gedacht als „Bildschirmschoner der Weltnachrichten“ – das ist der Screenshot-/Demo-Moment.
   - Echte Rotation (eine Umdrehung in 4 Min., ostwärts wie die Erde); Labels erscheinen nur, wenn ihre Redaktion zum Betrachter zeigt. Beenden per Escape, Ziehen oder Zoomen.
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
- ~~Transkontinentale Länder (Georgien, Armenien, Aserbaidschan)~~ → aufgenommen 2026-10-07 (Lückenschluss). Russland jenseits Moskaus: später.
- ~~Vanilla TS oder Svelte~~ → **Vanilla TypeScript** (entschieden nach dem Design-Spike).
- ~~Sprache der Website~~ → **Englisch** (UI-Texte, Kennzeichnungen wie „Top story“ / „Latest“). Headlines bleiben in Originalsprache.
- ~~Stadtnamen~~ → **Landessprache**, wie in der Seed-Liste (Praha, København, Athina).
- ~~„Regierungsnah“ kennzeichnen~~ → **nein**, nur dokumentiertes Staatseigentum/-kontrolle (`state`).
- ~~CJK-Schriften: Noto oder Systemschriften~~ → **Noto**, bei Bedarf nachgeladen (`src/ui/scriptfonts.ts`).
- ~~Maschinelle Übersetzung~~ → Übersetzung neuer Headlines **nach Englisch** in der GitHub Action mit einem **offenen Modell**: M2M100 1.2B (Meta, MIT) als CTranslate2-int8 (`scripts/translate_headlines.py`, Modell im Actions-Cache, einmalig erzeugt von `scripts/prepare_translation_model.sh`). Kein API-Dienst, kein Key, keine Kosten, keine Mengengrenze. Azure scheiterte an der Kontoeinrichtung, DeepL Free (500k Zeichen/Monat) reicht für ~3,3 Mio. Zeichen/Monat nicht. Übersetzung steht als `translations.en` am Headline-Item und bleibt erhalten, solange der Titel gleich ist. Im UI als „Machine-translated“ gekennzeichnet, Original bleibt sichtbar. Fehlt das Modell, läuft alles ohne Übersetzung weiter.

---

## 10. Weltweiter Ausbau (Plan, nach dem Europa-Launch)

Ziel: von ~150 Medien in Europa zu einigen Tausend weltweit – ohne die Prinzipien aus Abschnitt 2 aufzugeben. Reihenfolge: erst Fundament, dann Import-Pipeline, dann regionale Wellen.

### Schritt A – Fundament (ohne neue Medien; sinnvoll schon für Europa) – ✅ umgesetzt 2026-10-05
- **Daten aufteilen:** kleiner Index für den Globus (`id`, Position, Frische-Stufe, Anzahl je Stadt) + Detaildateien **pro Land**, nachgeladen beim Antippen/in der Liste. Budget „Daten-JSON < 100 KB gzip“ gilt für den Index.
  - Stand: Index ~6 KB gzip für 152 Medien (~40 B/Medium). Bei ~10.000 Medien wären es ~400 KB → dann weiter aufteilen: reiner Städte-Index für den Globus, Medien-Summaries pro Region, Suchindex separat.
- **Daten-Branch ohne Historie:** `headlines.json`/`status.json`/`http_cache.json` auf einen eigenen `data`-Branch, bei jedem Lauf überschrieben (force-push). Heute wächst `main` um ~1 GB/Jahr, weltweit um ein Vielfaches.
- **Karte:** echtes Clustering beim Herauszoomen (MapLibre-Cluster, Radius 14 px, bis Zoom 4; Cluster tragen hellste Frische, Summe der Medien, besten Tier); auf Weltebene nur Tier 1, Tier 2 ab Zoom 2,0–2,5, Tier 3 ab 2,6–3,2 (eingeblendet). Klick auf Cluster zoomt hinein.
- **Abruf-Takt nach Tier** (Datenfeld, kein Code pro Medium): Tier 1 alle 30 Min., Tier 2 stündlich, Tier 3 alle 2–3 h. Höhere Parallelität mit Limit pro Domain.
- **Ambient-Modus:** echte Rotation statt Pendeln über Europa.

### Schritt B – Import-Pipeline – ✅ umgesetzt 2026-10-05
- `scripts/import_wikidata.py`: Kandidaten pro Land aus **Wikidata** (CC0) – Name, Website, Sprache, Erscheinungsort mit Koordinaten, Eigentümer. Ergebnis: `data/seed/candidates/<land>.csv` zur Prüfung, nicht direkt in `sources.json`.
- Ablauf pro Land:
  1. `.venv/bin/python scripts/import_wikidata.py US` → `data/seed/candidates/US.csv`
  2. Prüfen: Spalte `include` = `yes` / `no` (`seeded` = schon in einer Seed-Datei, gleiche Domain). Fehlende Städte, Tier, `type` korrigieren; Medien, die Wikidata nicht kennt, als neue Zeilen ergänzen.
  3. `import_wikidata.py --accept US` → kopiert `include=yes` nach `data/seed/us.csv` (Seed-Spalten, ohne Prüfspalten)
  4. `build_sources.py`, dann `discover_feeds.py --only <neue ids>` und Report prüfen wie in Phase 1.
- Technik: SPARQL (query.wikidata.org) findet nur die IDs – je Wurzelklasse (Zeitung, Online-Zeitung, News-Website, Nachrichtenmagazin inkl. aller Unterklassen) und je Länder-Eigenschaft (`P17` Staat **oder** `P495` Herkunftsland, Wikidata nutzt beides, z. B. Kronen Zeitung nur `P495`). Details (Labels, Website, Sprache, Ort, Eigentümer, Sitelinks) über die Wikidata-API. Amtsblätter (`Q2065227` + Unterklassen) sind ausgeschlossen, außer das Medium ist zusätzlich als Zeitung typisiert. Aufgelöste Medien (`P576`, `P2669`) fallen raus.
- Namen und Städte in der Sprache des Mediums (Fallback `mul`, `en`). Ort = Erscheinungsort (`P291`), sonst Hauptsitz (`P159`); ohne Ort kein automatisches `yes`.
- Tier-Vorschlag aus Sitelinks: ≥ 15 → 1, ≥ 6 → 2, sonst 3. Staatseigentum: Eigentümer (`P127`) ist Regierung/Behörde/Staatsbetrieb → `note=state`, Beleg = Wikidata-Eintrag des Mediums.
- Sprache: Bei mehreren oder fehlenden Sprachen gewinnt die im Land häufigste Mediensprache (Wikidatas Amtssprachen-Liste führt für die USA Spanisch zuerst → CNN wäre spanisch geworden).
- Ausgeschlossen zusätzlich: Social-News-Seiten, News-Aggregatoren (Reddit).
- Pilot (2026-10-05): AT 32 Kandidaten (Quote 30), NZ 38 (23), EG 35 (107), US 3.847 (184); Lauf für die USA ~10 Min. Kandidatenlisten liegen in `data/seed/candidates/`.
- Bekannte Grenzen: Wikidata ist lückenhaft (AT: OÖN, VN fehlen; EG: nur 35 Kandidaten bei Quote 107; viele Einträge ohne Ort) und enthält Rauschen (Podcast-App, Firmenmagazin, falsche Websites). Staatseigentum ist nur erkennbar, wo Wikidata einen Eigentümer kennt (Al-Ahram, Voice of America werden **nicht** erkannt) – bei der Prüfung ergänzen. Die Kandidatenliste ist ein Startpunkt, kein Ersatz für die Prüfung.
- Tier-Vorschlag automatisch (z. B. Anzahl Wikipedia-Sprachversionen als Bekanntheits-Indiz), Entscheidung beim Prüfen.
- Handgepflegte Seeds (`europe.csv` usw.) haben immer Vorrang.
- Feed-Suche wie heute; eindeutige Fälle werden automatisch übernommen, manuell geprüft wird nur, was als `CHECK` markiert ist – sortiert nach Tier.

### Kontingente pro Land
- Größere Länder bekommen mehr Medien, kleine Länder trotzdem mehrere.
- **Richtwert:** `max(3, min(300, round(10 × √Einwohner in Mio.)))` – z. B. Liechtenstein 3, Österreich ~30, Deutschland ~90, USA ~180, Indien 300 (Deckel). Der Richtwert ist eine Obergrenze für den Import, kein Soll; pro Land wird bewusst angepasst (z. B. Länder mit sehr vielfältiger Presselandschaft oder mehreren Sprachgruppen).
- In sehr großen Ländern auf regionale Streuung achten (nicht nur Hauptstadt-Medien).

### Kennzeichnung staatsnaher Medien
- Wo die Information **leicht und belastbar** zu bekommen ist, wird ein Medium als staatsnah gekennzeichnet – betrifft in Diktaturen fast immer die großen Titel.
- Datenfeld `note` (wie `exile`): `state` = im Besitz oder unter Kontrolle des Staates/der Regierung (dokumentiert, z. B. Wikidata-Eigentümer, Impressum, Gesetz). UI-Label: „State-owned“ bzw. „State-controlled“, mit Erklärung auf der Info-Seite.
- Öffentlich-rechtliche Medien mit unabhängiger Aufsicht (ORF, BBC u. ä.) sind **nicht** `state`.
- ~~„Regierungsnah“ ohne Eigentum~~ → **wird nicht gekennzeichnet** (entschieden 2026-10-07). Redaktionelle Nähe ist eine Wertung; gekennzeichnet wird nur dokumentiertes Eigentum bzw. dokumentierte Kontrolle (`state`).
- Quelle der Einstufung im Datensatz festhalten (`note_source`), damit sie nachprüfbar ist.
- Gilt rückwirkend auch für Europa (z. B. Rossijskaja Gaseta, das offizielle Regierungsblatt Russlands).

### Schritt C – Regionale Wellen
**Welle 1 (Nordamerika & Ozeanien) – übernommen 2026-10-05:** 245 Medien (US 153, CA 48, AU 30, NZ 12, PG 1, FJ 1), davon 206 mit Feed; die 39 ohne Feed sind alle Tier 1/2. Erkenntnisse:
- US-Presse ist deutlich schwerer erreichbar als die europäische: Gannett hat RSS abgeschaltet, Tribune/News Corp AU blockieren (403), McClatchy läuft in Timeouts, einige Lokalblätter sperren Europa (451). Von 41 wichtigen Medien ohne Feed waren nur 3 von Hand zu retten.
- Regel seitdem: Tier 1/2 ohne Feed bleiben (ausgegraut, Prinzip 4); **Tier 3 ohne Feed wird durch den nächsten Kandidaten ersetzt** (Feed als Auswahlkriterium für austauschbare Regionalblätter). Ausgeschiedene stehen mit Grund in `decisions.csv`.
- „Ohne Feed“ heißt auch: verwaist (neuester Beitrag > 14 Tage, `ABANDONED_HOURS`) oder vom Abruf aus GitHub Actions dauerhaft gesperrt (403). Timeouts/429 erst nach mehreren Läufen werten.
- Wenn die Nachrücker kaum noch Feeds haben (US nach 6 Runden: < 20 %), wird nicht weiter nachgezogen: Entscheidung `drop` in `decisions.csv` = nicht aufnehmen **und** den Platz im Kontingent nicht nachbesetzen. Das Kontingent ist eine Obergrenze.
- Sitemap-Indizes: Agentur-Kinder (`ap`, `reuters`, …) sind nachrangig. Die News-Sitemaps der Hearst-Blätter standen zum Import still.
- Geokodierung: Bleibt eine gleichnamige Stadt mehrdeutig (Kansas City MO/KS, Kleinstädte namensgleich mit größeren), gilt die Wikidata-Koordinate des Mediums; Zeitzone vom nächsten GeoNames-Ort.
- Auch Nachrücker brauchen einen Blick: Diaspora-, Kirchen-, Uni- und Alternativblätter, und Hearst-Lokalblätter, deren Feed Agentur-Sportmeldungen statt Lokalnachrichten liefert.
- Samoa/Tonga: keine Wikidata-Einträge – nur per Handrecherche.
- Startansicht folgt der Zeitzone des Browsers (America/… → Nordamerika, Australia/… → Australien), ohne Standortabfrage.
**Welle 2 (Lateinamerika & Karibik) – übernommen 2026-10-06:** 211 Medien aus 29 Ländern (MX 46, BR 36, AR 30, CL 12, VE 12, …), davon 191 mit Feed (33 Aufmacher); die 20 ohne Feed sind Tier 1/2 (u. a. El Mercurio, El País UY, Proceso, Zero Hora). Erkenntnisse:
- Wikidata ist hier dünn: oft kein Erscheinungsort, Kandidatenlisten nach einer Austauschrunde erschöpft (94 Regionalblätter ohne Feed → nur 8 Nachrücker). Belize, Barbados, Grenada, Dominica ohne Kandidaten.
- Import-Fix: Medien, die in Wikidata als Zeitung **und** News-Website erfasst sind, gelten als `daily` (vorher `online` → nicht vorausgewählt; traf Excélsior, Milenio, El Universal VE, La Prensa NI).
- Hauptstadt-Presse ist stark konzentriert: Leitmedien über der Höchstzahl pro Stadt per `yes` in `decisions.csv` (Página/12, Infobae, Ámbito …).
- Medien, die Wikidata nicht als Nachrichtenmedium kennt (El Nacional, Le Nouvelliste, Jamaica Observer, Zero Hora …), stehen in der Handliste `data/seed/latam_manual.csv`; `hint_lat`/`hint_lon` dort für mehrdeutige Städte (San José).
- Kuba: alle Medien außer 14ymedio `state` (Verfassung 2019, Art. 55). Guyana Chronicle `state`. Confidencial (Nicaragua) `exile` in San José, Costa Rica.
- `drop` hält jetzt auch den Platz in der Stadt-Höchstzahl (vorher rückte das nächste Medium derselben Stadt nach).
- `skip_pattern` erstmals genutzt (Amandala: Ausgabe-Einträge überspringen).
- Rechtslage: Brasilien diskutiert Vergütung journalistischer Inhalte (PL 2.370) nur für große Plattformen (> 2 Mio. Nutzer); Titel + Link unberührt.

**Welle 3 (Nahost & Nordafrika, plus Ausbau Türkei) – übernommen 2026-10-06:** 111 neue Medien aus 19 Ländern (TR 17, IL 12, EG 11, IR 10, SA 10, DZ 8, …), davon 90 mit Feed; die 21 ohne Feed sind Tier 1/2 (u. a. Al-Ahram, El Watan, L'Orient-Le Jour). Jemen und Sudan ohne Medium (keine brauchbaren Kandidaten bzw. Feed für GitHub gesperrt). Schrift-Test im Browser bestanden (Kairo, Tel Aviv, Teheran: Richtung, Schriften nur bei Bedarf geladen). Erkenntnisse:
- **Lateinische Umschrift** für Namen und Städte, wie in `europe.csv` (Kathimerini, Athina): Ist die Wikidata-Bezeichnung in der Sprache des Mediums nicht lateinisch, gilt die englische (Al-Ahram, Cairo – nicht „Le Caire“). Medien ganz ohne lateinische Bezeichnung werden nicht aufgenommen.
- Wikidata-Ort = das Land selbst („Israel“) zählt als **kein Ort** – sonst landete der Marker im Landesmittelpunkt (Negev).
- 20 Medien `state`, Beleg jeweils Wikipedia: staatliche Presse in Ägypten, Algerien, Tunesien, Syrien; Iran (Kayhan, Ettela'at – Vertreter des Revolutionsführers; Hamshahri – Stadt Teheran; Jaam-e Jam – IRIB; Tehran Times); VAE (Abu Dhabi Media, Dubai Media); Al-Hayat al-Jadida (PA); Al Ra'i/Jordan Times (Mehrheit beim staatlichen Sozialfonds); Al-Sabah (Iraqi Media Network). „Regierungsnah“ ohne Eigentum (z. B. Youm7) bleibt ungekennzeichnet (entschieden, siehe oben).
- Armenische und jüdische Gemeindeblätter (Beirut, Istanbul, Teheran, Kairo) wie Diaspora-Blätter ausgeschlossen. Amtsblätter (Resmî Gazete, Um Al-Qura) ausgeschlossen.
- Handliste `data/seed/mena_manual.csv` (Irak, Libyen, große saudische Blätter, Maariv, Al-Quds …). Asharq Al-Awsat erscheint in London (`city_country` GB, ohne `exile`). Al-Quds (Jerusalem) per Koordinaten-Hinweis Palästina zugeordnet.
- Schriften: Noto Naskh Arabic und Noto Serif Hebrew (Fontsource, `unicode-range` → nur geladen, wenn solche Zeichen erscheinen). Für arabische Schrift und Hebräisch keine Sperrung (zerstört Buchstabenverbindungen), für Arabisch Zeilenhöhe 1,55.
- `scripts/refill_regional.py` ersetzt Tier-3-Medien ohne Feed rundenweise (vorher Einmal-Skript).

**Welle 4 (Süd-, Südost-, Ost- und Zentralasien) – übernommen 2026-10-07:** 314 neue Medien aus 29 Ländern/Gebieten (IN 137, JP 22, CN 18, KR 15, ID 14, …), davon 214 mit Feed; die 100 ohne Feed sind Tier 1/2. Schrift-Test bestanden (Tokio, Seoul, Taipeh, Chennai: Schrift je Sprache, nur bei Bedarf geladen). Kosten: eine japanische Stadtkarte lädt ~540 KB Schrift-Teile (Kanji über viele `unicode-range`-Teile verteilt) – nur wer CJK-Städte öffnet. Entschieden 2026-10-07: **Noto bleibt** (einheitliche Optik auf allen Geräten), keine Systemschriften. Timor-Leste, Mongolei, Turkmenistan ohne Medium. Erkenntnisse:
- **Festlandchina:** kaum Feeds von außen erreichbar (2 von 66) – Leitmedien bleiben grau, Regionalblätter gestrichen. Alle Festlandsmedien `state` (jede Zeitung braucht eine staatliche Trägereinheit; Beleg Wikipedia „Media of China“), Ausnahme Caixin (privat). Ebenso Vietnam (Pressegesetz 2016), Laos, Nordkorea; dazu Ta Kung Pao/Wen Wei Po (Verbindungsbüro), Lake House (Sri Lanka), Gorkhapatra (Nepal), Kuensel (Bhutan), Regierungsblätter in Kasachstan, Kirgistan, Usbekistan, Global New Light of Myanmar. 40 `state` in dieser Welle.
- **Hongkong/Macau:** Wikidata ordnet ihre Orte der Volksrepublik zu → der Import hielt sie für „Exil“. Alle HK/MO-Medien deshalb in der Handliste `data/seed/asia_manual.csv`. Traditionelles Chinesisch (TW, HK, MO) als `lang=zh-Hant`.
- Ebenso in der Handliste: Pravda Vostoka (Wikidata-Ort = Sowjetunion), Japan Times (Wikidata-Startseite = Abo-Portal), Greater Kashmir (zwei Städte namens Srinagar), führende Titel ohne Wikidata-Eintrag (Daily Jang, Express Tribune, Detik, Thanh Niên, Nhân Dân, Manila Bulletin …), The Irrawaddy (`exile`, Chiang Mai).
- **Rubrik-Feeds:** Die Feed-Suche griff bei indischen Portalen oft daneben (Sport, Astrologie, Horoskop, Kolumnen, Klatsch). `CHECK`-Fälle immer ansehen; ohne repräsentativen Feed lieber `none` direkt im Report (Dainik Bhaskar, The News International, Sunday Times LK).
- **Schriften:** CJK-Schriften kosten 25–35 KB gzip CSS **pro Sprache** (100+ `unicode-range`-Teile) → nur bei Bedarf per dynamischem Import (`src/ui/scriptfonts.ts`, aufgerufen von Karte, Live-Leiste, Ambient-Label). Indische und südostasiatische Schriften statisch (je < 0,5 KB CSS), zusammen +1,6 KB gzip. Keine Sperrung, mehr Zeilenhöhe; `:lang(ja)` usw. wählt die regionale Glyphenform.
- **Übersetzung:** Die Sprachliste in `translate_headlines.py` enthielt nur europäische Sprachen – jetzt alle 100 von M2M100 (`zh-Hant` → `zh`). Telugu, Assamesisch, Dhivehi, Dzongkha kann M2M100 nicht.
- **Abgleich Schrift ↔ Sprache** der Schlagzeilen nach dem ersten Abruf lohnt sich: fand E-Paper-Ausgabenlisten statt Schlagzeilen, eine gekaperte Domain (Casino-Spam), Partei-Website statt Zeitung (Akahata) und acht falsche Sprachen.

**Welle 5 (Afrika südlich der Sahara, plus Mauretanien) – übernommen 2026-10-07:** 132 neue Medien aus 45 Ländern (NG 13, ZA 11, ET 6, KE/UG/NA/BJ je 5, …), davon 105 mit Feed; die 27 ohne Feed sind Tier 1/2 (u. a. News24, New Vision, The Herald, Jornal de Angola). Zentralafrikanische Republik, Äquatorialguinea, Somalia ohne Medium. Erkenntnisse:
- Wikidata trägt hier kaum: ~85 Vorschläge für 47 Länder, viele Länder ohne einen Kandidaten. Die Handliste `data/seed/africa_manual.csv` trägt einen großen Teil (Liberia, Sierra Leone, Malawi, Burundi, Lesotho, Madagaskar, Daily Monitor, Mwananchi, The Herald …).
- **Online-Portale** sind in den frankophonen Ländern oft die wichtigsten Nachrichtenquellen (LeFaso.net, Malijet, Maliweb, Guinéenews, Cridem) → bewusst aufgenommen, obwohl die Vorauswahl Online-Medien unter Tier 1 sonst zurückhält.
- 23 `state`: staatliche Tageszeitungen sind hier oft Leitmedien (Le Soleil, Fraternité Matin, Sidwaya, Togo-Presse, La Nation BJ, Le Sahel, Horoya, Cameroon Tribune, L'Union, Jornal de Angola, Notícias, New Vision, Daily News TZ, Zimpapers, Zambia Daily Mail, Times of Zambia, New Era, Seychelles Nation, Al-Watwan, Ethiopian Herald, Shabait …). Beleg jeweils Wikipedia.
- Gruppen-Feeds: Bei den Blättern der namibischen NMH-Gruppe liefert `rssFeed/0` den gemeinsamen Feed der Gruppe (englischer Artikel bei der deutschsprachigen AZ) – eigene Rubrik-Feeds behalten.
- Schrift: Noto Serif Ethiopic für Amharisch/Tigrinya (statisch, < 0,2 KB CSS). Übersetzung: Swahili, Hausa, Yoruba, Amharisch, Afrikaans, isiZulu u. a. kann M2M100; Kinyarwanda, Shona, Chichewa, Tigrinya nicht.
- Kommentar-Filter der Feed-Suche erkannte WordPress-Kommentar-Feeds der Form `?feed=comments-rss2` nicht (Lesotho Times zeigte Spam-Kommentare) – Muster erweitert, alle Quellen geprüft.
- `skip_pattern` für Todesanzeigen (Midi Madagasikara: `^Nécrologie`).
- Rechtslage: Südafrikas Wettbewerbsbehörde verlangt Ausgleichszahlungen von Google & Co. an Verlage (Media and Digital Platforms Market Inquiry) – betrifft große Plattformen, nicht Titel + Link.

Jede Welle mit derselben Abnahme wie Phase 1/2 (Report geprüft, eine Woche Laufbetrieb) plus Schrift- und Übersetzungstest:
1. Nordamerika & Ozeanien (Englisch, viele Feeds)
2. Lateinamerika (Spanisch/Portugiesisch)
3. Naher Osten & Nordafrika (erster Test für Schrift von rechts nach links)
4. Süd- & Ostasien (CJK- und indische Schriften – Schriftgröße als Ladezeit-Thema; Noto-Familien mit `unicode-range`, nur bei Bedarf geladen)
5. Afrika südlich der Sahara (viele Sprachen, wenige Feeds, mehr Handarbeit)

Stand nach Welle 5: 1.165 Medien aus 173 Ländern und Gebieten.

**Lückenschluss – 2026-10-07:** 38 Medien von Hand (`data/seed/gaps_manual.csv`), jeweils Feed vorher mit `check_feeds.py` getestet. Neu vertreten: Georgien, Armenien, Aserbaidschan, Dominica, Grenada, St. Lucia, Samoa, Tonga, Vanuatu, Salomonen, Palau, Somalia, Zentralafrikanische Republik, Äquatorialguinea, Sudan, Jemen, Timor-Leste, Mongolei, Turkmenistan, Vatikan. Neue Feeds für bisher nur graue Länder: Albanien, Brunei, Kambodscha, Komoren, Laos, Sierra Leone.
- Exilmedien mit belegtem Redaktionsort: Meydan TV (Aserbaidschan → Berlin), Sudan Tribune (→ Paris), Diario Rombe (Äquatorialguinea → Madrid), Chronicles of Turkmenistan (→ Wien). Ohne belegten Ort **nicht** aufgenommen: Zerkalo (Belarus), Hasht-e Subh (Afghanistan).
- Nicht aufgenommen: Nachrichtenagenturen (Tatoli, Montsame, APA, Trend), Regierungs-Infodienste (SKNIS), Sender (Amu TV), kirchliche Medien (Newsbook Malta). Vatican News als `state` (Medium des Heiligen Stuhls).
- Schriften: Noto Serif Georgian und Armenian (statisch, je < 0,5 KB CSS).
- Feed-Suche robuster: relative Sitemap-Pfade in `robots.txt` werden aufgelöst; eine ungültige Kandidaten-URL bricht den Lauf nicht mehr ab.
- Weiterhin ohne Medium: St. Kitts und Nevis, Kiribati, Marshallinseln, Mikronesien, Nauru, Tuvalu (kein Feed gefunden). Nur graue Punkte: Afghanistan, Belarus, Eritrea, Fidschi, Liechtenstein, Malta, Nordkorea, Seychellen, Trinidad und Tobago, Samoa, Vanuatu.

Offen: eine Woche Laufbetrieb je Welle; Russland jenseits Moskaus.

### Bekannte Risiken
- **Übersetzung:** weltweit ~150–250 Mio. Zeichen/Monat. Mit dem offenen Modell machbar, aber Minuten pro Lauf; ggf. nur Tier 1–2 übersetzen. Sprachen außerhalb von M2M100 bleiben unübersetzt.
- **Blockaden:** mehr Seiten sperren Rechenzentrums-IPs (GitHub). Mehr ausgegraute Medien akzeptieren – oder Abruf später als Cloudflare-Cron, der nur JSON-Dateien schreibt (bewusst entscheiden, Prinzip 1).
- **Recht:** Titel + Link bleibt die Regel; Rechtslage für kurze Auszüge unterscheidet sich je Land – vor jeder Welle kurz prüfen.

---

## 11. Nicht tun

- Keine medienspezifischen Scraper oder Sonderlogik im Code.
- Keine Teaser, Bilder, Volltexte aus Feeds speichern oder anzeigen.
- Keine Tracking-Cookies; falls Analytics, dann cookielos.
- Keine Koordinaten raten – lieber Warnung im Report.
- Kein generisches „Dashboard“-Design mit Standard-Map-Kacheln und Default-Popups. Wenn es aussieht wie ein Template, ist es falsch.
