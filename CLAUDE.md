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
│  ├─ health_report.py           (Laufbetrieb: Erfolgsquote, blockierte/tote Feeds → data/health_report.csv)
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
├─ trigger/                     Cloudflare Worker: startet fetch.yml per Cron (nur Auslöser)
└─ .github/workflows/            fetch.yml (Abruf), deploy.yml (Build + Upload)
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
- `skip_pattern` (optional): Regex auf den Titel – passende Einträge werden übersprungen (Ausgaben, Todesanzeigen).
- `link_pattern` (optional): Regex auf den Artikel-Link – nur passende Einträge zählen. Für Regionalzeitungen, deren Feed/Sitemap die ganze Verlagsgruppe enthält, gefiltert auf den Erscheinungsort (z. B. `/lokal/magdeburg/`).
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
- Items, deren Titel offensichtlich Ticker/Service sind, optional überspringen (Muster in `sources.json` als `skip_pattern`, nicht im Code). Ebenso `link_pattern`: nur Items, deren Link passt (Lokalteil einer Verlagssitemap). Beide Felder bleiben bei `build_sources.py` erhalten.
- Kein Erfolg → alte Headline behalten, `fail_streak` erhöhen. Headline > 48 h → `stale`.
- Laufzeit-Ziel: < 2 Min. für 200 Quellen.
- Schreibt `headlines.json` und `status.json` nur, wenn sich etwas geändert hat.

### GitHub Action (`fetch.yml`)
- **Auslöser: Cloudflare Worker `trigger/`** (entschieden 2026-10-07), Cron `2,17,32,47 * * * *`, ruft nur `workflow_dispatch` von `fetch.yml` auf – keine Daten, keine Speicherung, kein öffentlicher Endpunkt (`workers_dev = false`). Grund: GitHub ließ im Oktober 2026 rund 45 von 48 geplanten Läufen pro Tag ausfallen. Deploy: `npx wrangler deploy --config trigger/wrangler.toml`; Secret `GITHUB_TOKEN` (fein granularer Token, nur dieses Repo, „Actions: Read and write“): `npx wrangler secret put GITHUB_TOKEN --config trigger/wrangler.toml`; Logs: `npx wrangler tail diurna-trigger`.
- `schedule: cron: '9,39 * * * *'` in `fetch.yml` bleibt als Rückfall + `workflow_dispatch` für manuelle Läufe. Mehr Auslöser heißen nicht mehr Abrufe: `fetch_headlines.py` holt nur fällige Quellen (Takt nach Tier).
- Zustand vom Branch `data` holen (`scripts/pull_data.sh`), `fetch_headlines.py` → `translate_headlines.py` → `build_frontend_data.py`, Ergebnis als **ein Commit ohne Historie** per force-push auf `data` (hält das Repo klein).
- Danach ruft `fetch.yml` `deploy.yml` auf: `npm run build` + `wrangler pages deploy dist` (Direct Upload, keine Git-Integration → zählt nicht gegen das Pages-Build-Limit). `deploy.yml` läuft außerdem bei jedem Code-Push.
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (ohne sie wird nur gebaut – bis 2026-10-07 war das der Fall, die Seite war nie veröffentlicht). Pages-Projektname: `diurna`, Adresse **https://diurna-5km.pages.dev** (`diurna.pages.dev` gehört einem anderen Konto). Angelegt 2026-10-07 als klassisches Pages-Projekt (`wrangler pages project create --force`, weil Wrangler Pages sonst auf „Pages in Workers“ umleitet); erster Deploy von Hand, seit 2026-10-07 13:20 UTC automatisch nach jedem Abruf. Lighthouse mobil auf Produktion: Performance 84, Barrierefreiheit/Best Practices/SEO 100.
- Hinweis: GitHub-Cron verspätet sich oft und lässt unter Last Läufe ganz ausfallen – deshalb der Cloudflare-Auslöser.

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
   - Weiter/Zurück/Play → Globus folgt der Leiste (Flug zur Stadt, Puls-Ringe, Markierung), ohne Panel; Antippen der Schlagzeile öffnet das Panel. Mitfliegen erst nach dieser Interaktion, nicht beim Laden; endet, sobald man den Globus selbst bewegt, einen Marker antippt oder sucht. Pause nur bei Hover/Fokus auf der Schlagzeile, nicht auf den Knöpfen.
   - Schon vor jeder Interaktion steigt die aktuelle Schlagzeile der Leiste als Label über ihrer Stadt auf (mit Puls), wenn die Stadt im Bild ist – die Kamera bleibt dabei stehen.
4. **Ambient-Modus (optional, Umschalter):** Globus dreht langsam; neue Schlagzeilen erscheinen kurz als schwebende Label an ihrem Punkt. Gedacht als „Bildschirmschoner der Weltnachrichten“ – das ist der Screenshot-/Demo-Moment.
   - Echte Rotation (eine Umdrehung in 4 Min., ostwärts wie die Erde); Labels erscheinen nur, wenn ihre Redaktion zum Betrachter zeigt. Beenden per Escape, Ziehen oder Zoomen.
   - Startet auch von selbst nach 45 s ohne Eingabe (nicht bei offenem Panel, Liste, Suche/Filter oder reduzierter Bewegung); dann bleibt die Bedienung sichtbar, und jede Eingabe inkl. Mausbewegung beendet ihn.
   - **Erster Besuch:** eine Zeile unter dem Schriftzug („What 1,245 newsrooms lead with, right now. Tap a light to read. About“), verschwindet mit der ersten Interaktion. Statuszeile zeigt zusätzlich „N new in the last hour“ (Desktop). Keine Landingpage.
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
- ~~Transkontinentale Länder (Georgien, Armenien, Aserbaidschan)~~ → aufgenommen 2026-10-07 (Lückenschluss). ~~Russland jenseits Moskaus~~ → aufgenommen 2026-10-07.
- ~~Vanilla TS oder Svelte~~ → **Vanilla TypeScript** (entschieden nach dem Design-Spike).
- ~~Sprache der Website~~ → **Englisch** (UI-Texte, Kennzeichnungen wie „Top story“ / „Latest“). Headlines bleiben in Originalsprache.
- ~~Stadtnamen~~ → **Landessprache**, wie in der Seed-Liste (Praha, København, Athina).
- ~~„Regierungsnah“ kennzeichnen~~ → **nein**, nur dokumentiertes Staatseigentum/-kontrolle (`state`).
- ~~CJK-Schriften: Noto oder Systemschriften~~ → **Noto**, bei Bedarf nachgeladen (`src/ui/scriptfonts.ts`).
- ~~Maschinelle Übersetzung~~ → Übersetzung neuer Headlines **nach Englisch** in der GitHub Action mit einem **offenen Modell**: M2M100 1.2B (Meta, MIT) als CTranslate2-int8 (`scripts/translate_headlines.py`, Modell im Actions-Cache, einmalig erzeugt von `scripts/prepare_translation_model.sh`). Kein API-Dienst, kein Key, keine Kosten, keine Mengengrenze. Azure scheiterte an der Kontoeinrichtung, DeepL Free (500k Zeichen/Monat) reicht für ~3,3 Mio. Zeichen/Monat nicht. Übersetzung steht als `translations.en` am Headline-Item und bleibt erhalten, solange der Titel gleich ist. Im UI als „Machine-translated“ gekennzeichnet, Original bleibt sichtbar. Das Modell gerät gelegentlich in Schleifen („Fire Crisis: Fire Crisis: …“) – solche Ausgaben verwirft `plausible()`, auch bereits gespeicherte (2026-10-07: 18 von 588). Fehlt das Modell, läuft alles ohne Übersetzung weiter.

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

**Lückenschluss – 2026-10-07:** 37 Medien von Hand (`data/seed/gaps_manual.csv`), jeweils Feed vorher mit `check_feeds.py` getestet. Neu vertreten: Georgien, Armenien, Aserbaidschan, Dominica, Grenada, St. Lucia, Samoa, Tonga, Vanuatu, Salomonen, Palau, Somalia, Zentralafrikanische Republik, Äquatorialguinea, Sudan, Jemen, Timor-Leste, Mongolei, Turkmenistan, Vatikan. Neue Feeds für bisher nur graue Länder: Albanien, Brunei, Kambodscha, Komoren, Laos, Sierra Leone.
- Exilmedien mit belegtem Redaktionsort: Meydan TV (Aserbaidschan → Berlin), Sudan Tribune (→ Paris), Diario Rombe (Äquatorialguinea → Madrid), Chronicles of Turkmenistan (→ Wien). Ohne belegten Ort **nicht** aufgenommen: Zerkalo (Belarus), Hasht-e Subh (Afghanistan).
- Nicht aufgenommen: Nachrichtenagenturen (Tatoli, Montsame, APA, Trend), Regierungs-Infodienste (SKNIS), Sender (Amu TV), kirchliche Medien (Newsbook Malta). Vatican News als `state` (Medium des Heiligen Stuhls).
- Übersetzung Georgisch/Armenisch durch M2M100 teils unbrauchbar (erfundene Sätze) → für `ka`/`hy` abgeschaltet (`UNRELIABLE` in `translate_headlines.py`), vorhandene Übersetzungen werden entfernt.
- Schriften: Noto Serif Georgian und Armenian (statisch, je < 0,5 KB CSS).
- Feed-Suche robuster: relative Sitemap-Pfade in `robots.txt` werden aufgelöst; eine ungültige Kandidaten-URL bricht den Lauf nicht mehr ab.
- Kleinstaaten (2026-10-07): St. Kitts-Nevis Observer (Basseterre) und Marshall Islands Journal (Majuro) als graue Punkte – Leitmedien ohne Feed bzw. mit Bot-Schutz, Startseite erreichbar. Times Caribbean (St. Kitts) nicht aufgenommen: kein Redaktionsort, übernimmt überwiegend Meldungen des Regierungs-Infodienstes. ZIZ (St. Kitts) ist ein Sender. **Weiterhin ohne Medium: Kiribati, Mikronesien, Nauru, Tuvalu** – keine erreichbare Medien-Website gefunden.
- Zweite Runde für Länder mit nur grauen Punkten (2026-10-07): Onliner (Belarus, Minsk), Islands Business (Fidschi, Suva), MaltaToday (Malta, San Ġwann – Ort laut Kontaktseite). Weiterhin nur grau: Afghanistan, Eritrea, Liechtenstein, Macau, Nordkorea, Samoa, Seychellen, Trinidad und Tobago, Vanuatu. Gefundene, aber nicht aufgenommene Feeds: Exilmedien ohne belegten Redaktionsort (KabulNow, Etilaatroz, Zerkalo, Reform.news), Sender (VBTC Vanuatu), Kirchenmedien (Newsbook Malta). Liechtensteiner Volksblatt ist 2023 eingestellt worden.

**Russland – 2026-10-07:** 42 Medien in 25 Städten (vorher 4: Kommersant, Rossijskaja Gaseta, Meduza, Nowaja Gaseta Europa), davon 38 mit Feed. Moskauer Leitmedien (Novaya Gazeta, Vedomosti, RBC, MK, Komsomolskaja Prawda, Vzglyad) plus Regionen von Kaliningrad bis Wladiwostok, Minderheitensprachen (Tatarisch, Tschetschenisch, Kabardinisch, Tabassaranisch). Handliste `data/seed/russia_manual.csv`. Erkenntnisse:
- **EU-Sanktionen (Verordnung 833/2014, Art. 2f, Anhang XV):** Verbot, Inhalte gelisteter Medien zu verbreiten oder dazu beizutragen – laut Kommissions-FAQ im weitesten Sinn, auch Nachrichtenmeldungen online; Ausnahme nur für einordnende journalistische Berichterstattung. Automatisch angezeigte Schlagzeilen + Links fallen darunter. Deshalb `data/sanctioned_media.csv` (Domain, Name, Rechtsgrundlage): `build_sources.py` lässt diese Medien aus jeder Seed-Datei weg, der Import wählt sie nicht vor. **Rossijskaja Gaseta wurde dadurch entfernt.** Liste bei neuen Sanktionspaketen nachpflegen (EUR-Lex, konsolidierte Fassung von Anhang XV).
- **Staatseigentum belegt über die russische Wikipedia:** Gründer-Feld (учредитель) automatisch ausgelesen; `state` nur, wenn es eine Behörde oder staatliche/kommunale Einrichtung nennt (Правительство, администрация, ГУП, ГАУ, МАУ …). Beleg = Wikipedia-Artikel.
- Krim (Krymskaja Prawda, Sewastopolskaja Gaseta, Pobeda Feodossija): **nicht** unter Russland aufgenommen.
- Import: Ein Ort mit mehreren Staaten (Moskau: Russland und Sowjetunion) gehört zum Importland; kyrillische Namen ohne lateinische Bezeichnung werden transliteriert (BGN/PCGN-Stil, wie „Dzerkalo Tyzhnia“).
- Netzwerk-Feeds: Die Stadtportale eines Netzes (NGS24, 161.ru, 59.ru, 63.ru) liefern dieselbe Schlagzeile → nur NGS behalten.
- Kaum Nachrücker: Wikidata kennt wenige russische Regionalblätter mit Ort; 43 ohne Feed ersatzlos gestrichen.

**Stadtnamen vereinheitlicht (alle Wellen):** Medien am selben GeoNames-Ort bekommen denselben Stadtnamen – aus `europe.csv`, wenn vorhanden (zweisprachig beide: „Brussel / Bruxelles“), sonst den häufigsten (vorher doppelt: Wien/Vienna, Moskva/Moscow, Hà Nội/Hanoi, Montréal/Montreal …). `build_sources.py` warnt, wenn ein Ort unter mehreren Namen auftaucht; verbleibende Warnungen sind echte Nachbarstädte (Makati/Manila, Viña del Mar/Valparaíso). Stadtteile als Ort (Cuauhtémoc, Mushin, East Perth …) per Entscheidung auf die Stadt gesetzt; dabei bisher ausgewählte Medien in AU/MX per `yes` festgehalten, damit die Stadt-Höchstzahl sie nicht verdrängt.

**Performance mit 1.245 Medien (2026-10-07):** Index 48 KB gzip (Budget 100), größte Länderdatei IN 17 KB. Die Listenansicht wurde beim Start verborgen mit ~7.400 Elementen aufgebaut → jetzt erst beim ersten Öffnen (Start: 415 statt 7.819 DOM-Elemente; Lighthouse mobil lokal 47 → 82–85, Total Blocking Time 3 s → 0,1–0,15 s). Geöffnete Liste (~21.000 Elemente): `content-visibility: auto` je Land – Layout/Darstellung nur in Sichtnähe, Inhalt bleibt für Screenreader und Seitensuche vollständig; längste blockierende Aufgabe beim Öffnen 255 ms → 0 ms (Desktop). LCP ~4 s in Lighthouse liegt vor allem am WebGL-Globus mit Software-Grafik – auf echtem Gerät messen.

**Welle 6 (Europa), Pilot Deutschland – 2026-10-08:** 80 Medien (vorher 10), **nur mit Feed** (Vorgabe). Alle 16 Länder vertreten. 43 aus Wikidata (viele Leitmedien dort ohne Ort → Ort per `decisions.csv`), 28 aus der Handliste `data/seed/de_manual.csv` (Wikidata kennt u. a. Rheinische Post, Augsburger Allgemeine, HAZ, MZ, Südkurier nicht). Erkenntnisse:
- **Verlagsgruppen-Feeds:** Die Hauptfeeds der Regionalzeitungen (Madsack, Funke, Ippen, NPG, Mediengruppe Magdeburg …) liefern überregionale Agenturmeldungen – im Test stand dieselbe Schlagzeile bei bis zu neun Titeln. Deshalb **Lokal-Feed des Erscheinungsorts** (39 Titel, in `feed_overrides.csv`) bzw. **`link_pattern`** auf die Gruppen-Sitemap (19 Titel). Ergebnis: 80 verschiedene Schlagzeilen bis auf eine Dublette. Lokal-Feeds sind langsamer (neuester Beitrag oft 2–6 h statt Minuten).
- Muster je Gruppe: Madsack `/arc/outboundfeeds/rss/category/lokales/<ort>/`, Funke `/lokales/<ort>/rss`, Ippen `/<ort>/rssfeed.rdf`, RP-Gruppe `…/<ort>/feed.rss`, KStA `feed.ksta.de/feed/rss/koeln/`, LZ `/_lz_daten/_export/rss/<ort>/`.
- Ohne Feed raus (15): Badische Zeitung, Mittelbayerische, Mannheimer Morgen (403), PNP, Donaukurier, Weser-Kurier, Kölnische Rundschau, Heilbronner Stimme, NWZ, Hildesheimer, Pforzheimer; nur Fremd-/Gruppenfeed: PNN (Tagesspiegel), Schwäbisches Tagblatt (SWP), SVZ (Nordkurier), Flensburger Tageblatt (shz). Stuttgarter Nachrichten raus (gleiche Redaktion und Schlagzeile wie Stuttgarter Zeitung).
- Nicht aufgenommen: Anzeigenblätter, Parteizeitungen (Vorwärts, Unsere Zeit, Bayernkurier), Sender (tagesschau.de, ZDFheute), Verbands-/Gemeindeblätter; kleine politische Wochenzeitungen (Junge Freiheit, Jungle World, der Freitag) vorerst nicht – offen. Tageszeitungen junge Welt und nd aufgenommen.
- Aachener Zeitung: Lokal-Feed antwortete nach vielen Testabrufen mit 403 – im Laufbetrieb beobachten.

**Welle 6 – Großbritannien – 2026-10-09:** 66 Medien (vorher 9), nur mit Feed, keine doppelte Schlagzeile im Test. 40 aus Wikidata, 17 aus der Handliste `data/seed/gb_manual.csv` (Nottingham Post, Leicester Mercury, Hull Daily Mail, The Star Sheffield, Kent Messenger, Derry Journal …). England, Schottland, Wales und Nordirland vertreten. Erkenntnisse:
- Wie in Deutschland liefern die Gruppen-Feeds Überregionales (National World: dieselbe Supermarkt-Meldung bei fünf Titeln; Reach: Sozialamts-Meldungen). Lokal-Feeds je Gruppe (44 Titel, `feed_overrides.csv`): **Reach** `/news/<region>-news/?service=rss` (Region von der Seite `/news/` abgelesen), **Newsquest** `/news/rss/` (Startseite 403, Feed erreichbar), **National World** `/news/rss`.
- **DC Thomson** (Press and Journal, The Courier) sperrt Seite und Feeds (403) → nicht aufgenommen.
- Nicht aufgenommen: BBC (Sender), The Times doppelt (andere Domain), Gemeinde-, Kirchen- und Diasporablätter, Magazine (New Statesman), arabische Exil-/Auslandspresse in London (gehört zur Nahost-Welle).

**Welle 6 – Frankreich – 2026-10-09:** 33 Medien (vorher 9), alle neuen mit Feed; Les Echos bleibt grau (Tier 2, schon vorher ohne Feed). 23 aus Wikidata, Var-Matin von Hand (`data/seed/fr_manual.csv`). Neu u. a. L'Humanité, La Croix, L'Opinion, Mediapart, 20 Minutes, die EBRA-Blätter, Nice-Matin, Midi Libre, La Provence, Corse-Matin, Le Télégramme. Erkenntnisse:
- Wikidatas Vorauswahl war für Frankreich unbrauchbar (Kleinstblätter, Gallica-Archivbestände, Anzeigenblätter); große Regionaltitel ohne Ort. Auswahl von Hand: überregionale Tageszeitungen + PQR.
- **EBRA** (Est Républicain, Républicain lorrain, Vosges Matin, DNA, L'Alsace, Dauphiné, Bien Public, JSL, Le Progrès): gemeinsame Gruppenmeldungen im Hauptfeed → Lokalausgabe `/edition-<ausgabe>/rss` (Ausgaben von der Startseite abgelesen). Nice-Matin/Var-Matin: `nicematin.com/<stadt>/rss`. La Provence: `link_pattern` `/article/region/`.
- **Gesperrt (403 auf Seite und Feeds) → nicht aufgenommen (14):** Rossel (La Voix du Nord, Courrier picard, Nord Littoral, L'Union, L'Est-Éclair), Centre France (La Montagne, Le Populaire du Centre, Le Journal du Centre, La République du Centre, Le Berry républicain, L'Yonne républicaine), La Nouvelle République, Paris-Normandie; Journal du Pays basque (Timeout). Ouest-France-Gruppe (Le Maine libre, Presse Océan, Courrier de l'Ouest) nur noch Rubriken auf ouest-france.fr, deren Feeds gesperrt → nicht aufgenommen. Damit fehlen Nord, Picardie, Auvergne, Centre und Normandie weitgehend – Lücke bleibt, bis die Verlage Feeds freigeben.
- Nicht aufgenommen: Nachrichtenmagazine (Le Point, L'Express, L'Obs, Paris Match), Satire-Wochenblätter (Canard enchaîné, Charlie Hebdo), Le JDD, Courrier international. Übersee-Départements (Réunion, Antillen, Guyane, Neukaledonien, Polynesien) offen – eigene ISO-Codes, eigene Runde.
- Le Télégramme: Domain auf `.fr` umgezogen, Override auf den https-Feed.

**Welle 6 – Italien – 2026-10-09:** 36 Medien (vorher 7), alle mit Feed, keine doppelte Schlagzeile im Test. 23 aus Wikidata, 6 von Hand (`data/seed/it_manual.csv`: La Nazione, La Sicilia, Gazzetta di Parma, l'Adige, Corriere dell'Umbria, Quotidiano del Sud). Überregional neu: il Giornale, il manifesto, il Foglio, Libero, Il Tempo, Il Giorno, Domani, La Verità, il Post. Minderheiten: Dolomiten (Deutsch, Bozen – Feed über das eigene Portal stol.it), Primorski dnevnik (Slowenisch, Triest – Feed der Triester Rubrik). Erkenntnisse:
- Italienische Feeds sind überwiegend lokal genug; Lokalisierung nur bei Gazzetta del Sud (Messina-Feed, `skip_pattern` `^Rassegna stampa` für die tägliche Presseschau) und per `link_pattern` bei Gazzetta di Parma, Corriere dell'Umbria, La Sicilia (Sitemaps mit viel Agentur-Inland/Ausland).
- **Ohne Feed nicht aufgenommen (15):** die NEM-Blätter (La Nuova Sardegna, Il Tirreno, Il Mattino di Padova, Gazzetta di Mantova, Gazzetta di Modena, La Provincia Pavese, il Centro – teils nicht erreichbar), Athesia-Blätter L'Arena und Il Giornale di Vicenza, L'Eco di Bergamo, La Provincia (Como), Il Secolo XIX (429), l'Unità, Avvenire (News-Sitemap nur mit Testeinträgen), La Gazzetta del Mezzogiorno (Feed seit einer Woche still).
- Nicht aufgenommen: Sportzeitungen (Tuttosport), Gratisblätter (Leggo), Parteinahe (Secolo d'Italia), Il Dubbio (Anwaltsstiftung), Kirchenblätter.

**Welle 6 – Spanien – 2026-10-09:** 42 Medien (vorher 7), alle neuen mit Feed (El Periódico bleibt grau, Tier 2, schon vorher ohne Feed). 32 aus Wikidata, 3 von Hand (`data/seed/es_manual.csv`: Ara, La Rioja, Nós Diario). Überregional neu: La Razón, 20minutos, El Confidencial, El Español, Okdiario. Sprachen: Katalanisch (Ara, VilaWeb, El Nacional, El Punt Avui, Segre), Baskisch (Berria), Galicisch (Nós Diario). Alle Autonomen Gemeinschaften außer Balearen (nur Prensa Ibérica) vertreten, dazu Melilla. Erkenntnisse:
- **Vocento** (El Correo, Diario Vasco, Norte de Castilla, Sur, Ideal, La Verdad, Hoy, El Comercio, Diario Montañés, La Rioja): Hauptfeed mit gruppenweiten Motor-/Werbemeldungen → Stadt-/Provinzrubrik `/rss/2.0/?section=<ort>` (auch beim schon vorhandenen El Correo umgestellt).
- **Prensa Ibérica** (Faro de Vigo, La Nueva España, Levante-EMV, Información, Diario de Mallorca, La Provincia, Diario Córdoba, El Periódico Mediterráneo, El Día, El Correo Gallego) und **Grupo Noticias** (Deia, Noticias de Navarra) sperren Seite und Feeds mit 406 → nicht aufgenommen. Público ohne Feed.
- Stadtnamen in amtlicher Form (A Coruña, Ourense, Lleida, Donostia / San Sebastián), nicht in der kastilischen Wikidata-Form. Sermos Galiza heißt heute Nós Diario.
- Nicht aufgenommen: Sportzeitungen (Marca, Sport, Superdeporte), Wirtschaftsblätter (Expansión, Cinco Días), Satire (El Mundo Today), Gewerkschaftsblatt (CNT), Archivbestände.

**Welle 6 – Polen – 2026-10-09:** 29 Medien (vorher 4), alle mit Feed: Dziennik Gazeta Prawna, Nasz Dziennik, Onet, Wirtualna Polska, OKO.press, wPolityce, Super Nowości (Rzeszów), Kurier Szczeciński, Wochenblatt (Deutsch, Opole) und 17 Lokalausgaben der Gazeta Wyborcza. Erkenntnisse:
- Wikidata kennt nur 56 polnische Kandidaten, viele ohne Ort.
- **Polska Press** (16 Regionalzeitungen von Dziennik Zachodni bis Gazeta Lubuska): Alle Feeds, auch `/rss/wiadomosci.xml`, liefern gruppenweite Rezepte, Horoskope, Promi- und Ratgeberlisten; keine Lokalnachrichten-Rubrik, Sitemaps hinter Cloudflare-Prüfung → wie die indischen Rubrik-Feeds als „kein repräsentativer Feed“ gewertet, nicht aufgenommen. Das schon vorhandene Dziennik Polski (Kraków) zeigte dasselbe → aus `europe.csv` entfernt, ersetzt durch die Krakauer Wyborcza-Ausgabe (entschieden 2026-10-09).
- Nicht aufgenommen: Super Express, Gazeta Polska Codziennie, Niva (kein Feed), Gazeta Olsztyńska (403); Wochenmagazine (Polityka, Wprost, Tygodnik Powszechny).
- Dziennik Gazeta Prawna: Wikidata nennt das Portal dziennik.pl als Website → Handliste mit gazetaprawna.pl. Nasz Dziennik: `skip_pattern` für das tägliche Stundengebet („Jutrzyna“ …).
- **Lokalausgaben der Gazeta Wyborcza** als Ersatz für die fehlende Regionalpresse (entschieden 2026-10-09): je eine Lokalredaktion mit eigenem Feed `<ort>.wyborcza.pl/pub/rss/<ort>.xml`, Name „Gazeta Wyborcza <Ort>“, Tier 3, in `pl_manual.csv`. 17 Städte; nicht: Częstochowa (gleicher Feed wie Katowice), Płock (Feed seit Tagen still), Zielona Góra (kein Feed), Warszawa (Sitz der Hauptausgabe). Erster Fall, in dem Ausgaben einer Marke als eigene Medien geführt werden – nur als Ausnahme, wo die Regionalpresse sonst fehlt.

**Welle 6 – Ukraine – 2026-10-09:** 30 Medien (vorher 4), alle mit Feed, keine doppelte Schlagzeile im Test. Neu: Kyiv Post, NV, LB.ua, Censor.net, RBC-Ukraine (ukrainischer Feed statt des russischsprachigen), ZAXID.NET (Lwiw), Dumskaja (Odessa, `lang=ru` – schreibt überwiegend Russisch), Kárpátinfo (ungarische Minderheit, Berehowe) und 18 Portale des Netzes „City Sites“ (057.ua Charkiw, 061.ua Saporischschja, 056.ua Dnipro … – je ein Portal pro Gebietshauptstadt, eigene Lokalredaktionen, Feed `/rss`, Tier 3, in `ua_manual.csv`). Erkenntnisse:
- **Vorgabe (2026-10-09): keine russischen Sprachrohre.** Nicht aufgenommen: Medien aus besetzten Gebieten (Krim, besetzter Donbas – wie die Krim bei Russland), Strana.ua (in der Ukraine gesperrt). Geprüft: Dumskaja (Umfeld des Abgeordneten Hontscharenko, früher Poroschenko-Block) und das City-Sites-Netz (ukrainisch, gegründet in Mariupol; 061.ua von Besatzern mit „Tribunal“ bedroht) – unbedenklich. Quellen: IMI (imi.org.ua).
- Nicht aufgenommen: Ukrinform (staatliche Agentur), Holos Ukrajiny (Parlamentsblatt), Fakty ICTV (Sender); ohne Feed oder gesperrt: Den, Fakty i Kommentarii, Obozrevatel, Kárpáti Igaz Szó, Wetschirnja Odesa (403), Ekspres, Zorile Bucovinei, Status Quo; Industrialne Saporischschja (SEO-Inhalte statt Lokalnachrichten); 0382.com.ua Chmelnyzkyj (403).
- Das City-Sites-Netz ist nach Wyborcza der zweite Fall eines Netzes unter einer Marke – aufgenommen, weil die ukrainische Regionalpresse sonst fast ganz fehlt; die Portale formulieren eigene Meldungen.

**Welle 6 – Niederlande – 2026-10-09:** 27 Medien (vorher 5), alle mit Feed, keine doppelte Schlagzeile im Test. Wikidata kennt nur 15 niederländische Kandidaten → 19 von Hand (`data/seed/nl_manual.csv`). Neu: Het Parool, FD, NU.nl, Follow the Money, Nederlands Dagblad, Reformatorisch Dagblad und Regionalzeitungen aller Provinzen. **DPG Media** (Gelderlander, Brabants Dagblad, Eindhovens Dagblad, BN DeStem, PZC, Tubantia, De Stentor): Hauptfeed `/home/rss.xml` gruppenweit (dieselbe Netflix-Meldung bei fünf Titeln) → Stadt-Feed `/<stadt>/rss.xml`; Utrechts Nieuwsblad = `ad.nl/utrecht/rss.xml`. Mediahuis- und NDC-Blätter liefern lokale Hauptfeeds.

**Welle 6 – Österreich – 2026-10-09:** 15 Medien (vorher 9). Neu von Hand (`data/seed/at_manual.csv`): Heute, oe24, Wiener Zeitung (`state` – Eigentum der Republik, seit 2023 online), NÖN (St. Pölten) und BVZ (Eisenstadt) als Wochenzeitungen für Niederösterreich und das Burgenland, 5 Minuten (Kärnten). NÖN/BVZ teilen den Gruppen-Feed → `link_pattern` ohne `in-ausland`/Sport; 5 Minuten → nur Kärnten-Rubriken. Vorarlberger Nachrichten weiter ohne Feed (grau). oe24: News-Sitemap enthält auch Werbe-/Immobilienbeiträge – beobachten. Nicht aufgenommen: Falter, Profil (Magazine), ORF (Sender), Regionalmedien Austria (Anzeigenblätter), Bécsi Napló (Diaspora).

**Welle 6 – Schweiz – 2026-10-09:** 21 Medien (vorher 5), alle drei großen Sprachregionen. Neu: 20 Minuten, watson, Berner Zeitung, Der Bund, Basler Zeitung, St. Galler Tagblatt, Aargauer Zeitung (Feed der Aargau-Rubrik), Luzerner Zeitung, Südostschweiz (Chur); Tribune de Genève, 24 heures, Le Courrier, ArcInfo, Le Nouvelliste (News-Sitemap), Le Quotidien jurassien; La Regione (Bellinzona). Tamedia-Titel haben eigene News-Sitemaps mit eigenen Schlagzeilen – keine Lokalisierung nötig. Nicht aufgenommen: La Liberté (403), Bieler Tagblatt (kein Feed), Der Landbote (online nur noch Rubrik des Tages-Anzeigers, ohne eigenen Feed und ohne Rubrik im Link); Weltwoche, WOZ (Wochenblätter), eingestellte Titel (TagesWoche, Baslerstab). Corriere del Ticino bleibt grau.

**Welle 6 – Belgien – 2026-10-09:** 12 Medien (vorher 4). Neu: De Morgen, Het Nieuwsblad, Gazet van Antwerpen, Het Belang van Limburg, DH, L'Avenir (Namur), The Brussels Times, Politico Europe. Mediahuis-Titel teilen Inhalte → `link_pattern` (GvA `/regio/antwerpen/`, HBvL `/regio/limburg/`, Nieuwsblad ohne Antwerpen/Limburg/Sport). **Rossel/Sudpresse** (La Meuse, La Nouvelle Gazette, GrenzEcho), L'Écho und Krant van West-Vlaanderen sperren (403/405) → nicht aufgenommen; damit fehlen Lüttich, Charleroi und die Deutschsprachige Gemeinschaft.

**Welle 6 – Nordeuropa – 2026-10-09:** Schweden 25 (vorher 5), Finnland 20 (4), Norwegen 14 (4), Dänemark 8 (3), alle neuen mit Feed. Minderheiten: Ávvir (Samisch, Karasjok), Der Nordschleswiger (Deutsch, Aabenraa), finnlandschwedische Blätter (Vasabladet, Österbottens Tidning, Åland). Erkenntnisse:
- **Schwedische Regionalgruppen** (Gota Media, Bonnier News Lokal, NTM; Feed `/feeds/feed.xml`) und **HSS Media** (FI): gemeinsame Sport-/Auslandsmeldungen → `link_pattern`, das überregionale Rubriken (`/sport`, `/varlden`, `/utrikes` …) ausschließt; der erste Pfadteil ist dort der Ort. Vasabladet/ÖT zusätzlich auf ihre Gemeinden beschränkt.
- **Ohne erreichbaren Feed nicht aufgenommen (23):** fast alle **Amedia**-Titel in Norwegen (Nordlys, Bergensavisen, Avisa Nordland, Drammens Tidende, Tønsbergs Blad, Fredriksstad Blad, Gudbrandsdølen Dagningen, Finnmark Dagblad …) und Nettavisen; Vårt Land, Svalbardposten; **Jysk Fynske Medier** (Fyens Stiftstidende, Århus Stiftstidende, JydskeVestkysten), Kristeligt Dagblad, Bornholms Tidende; Åbo Underrättelser, Kainuun Sanomat, Keskipohjanmaa; Västerbottens-Kuriren (403). Damit ist Nordnorwegen nur über Ávvir (Karasjok) vertreten und Dänemark außerhalb Kopenhagens nur über Aalborg (Nordjyske) und Aabenraa (Der Nordschleswiger).
- Ekstra Bladet: Nachrichten-Feed `/rssfeed/nyheder/`. Nicht aufgenommen: Parteiblätter (Demokraatti, Suomenmaa), Wirtschaftsblätter, Wochenzeitungen (Morgenbladet, Weekendavisen).

**Bilanz Welle 6 (Europa, 2026-10-08/09):** 8 Länder von 55 auf 343 Medien (DE 80, GB 66, IT 36, ES 42, FR 33, PL 29, UA 30, NL 27 – Zahlen inkl. vorher vorhandener). Gemeinsames Muster: Regionalverlage bündeln Inhalte, die Hauptfeeds zeigen gruppenweite Meldungen → Lokal-Feeds (`feed_overrides.csv`) oder `link_pattern`. Wo Verlage Seite und Feeds sperren (FR: Rossel, Centre France; ES: Prensa Ibérica; GB: DC Thomson) oder nur Klickstrecken liefern (PL: Polska Press), bleiben Lücken. Noch offen in Europa: übrige Länder (AT, CH, BE, Nordeuropa, Südosteuropa, Baltikum …) mit gleichem Verfahren; Abnahme der Welle nach einer Woche Laufbetrieb.

**Laufbetrieb – gestartet 2026-10-07:** `status.json` führt jetzt `since` (erster Abruf) je Quelle; `scripts/health_report.py` (nach `npm run data`) schreibt `data/health_report.csv` und fasst zusammen: Erfolgsquote, blockiert (401/403/451), gedrosselt (429), unerreichbar (Timeouts), tot (≥ 10 Fehler in Folge), veraltet, < 50 % Erfolg, und welche Quellen noch keine Woche beobachtet sind. Ausgangswert: 94,9 % Erfolg über 11.388 Abrufe; 956 von 1.019 Feeds ok. **Abnahme ab 2026-10-14:** Bericht erneut erstellen; Tier-3-Medien, die die ganze Woche blockiert/unerreichbar/gedrosselt waren, ersetzen oder `drop`; Tier 1/2 bleiben grau; 404-Feeds neu suchen (`discover_feeds.py --only`). Auffällig schon jetzt: einige Feeds liefern nur dem GitHub-Rechner 404 (Daily Monitor, Loksatta, Newsweek) – von außen funktionieren sie.

### Bekannte Risiken
- **Übersetzung:** weltweit ~150–250 Mio. Zeichen/Monat. Mit dem offenen Modell machbar, aber Minuten pro Lauf; ggf. nur Tier 1–2 übersetzen. Sprachen außerhalb von M2M100 bleiben unübersetzt.
- **Blockaden:** mehr Seiten sperren Rechenzentrums-IPs (GitHub). Mehr ausgegraute Medien akzeptieren – oder Abruf später als Cloudflare-Cron, der nur JSON-Dateien schreibt (bewusst entscheiden, Prinzip 1).
- **Recht:** Titel + Link bleibt die Regel; Rechtslage für kurze Auszüge unterscheidet sich je Land – vor jeder Welle kurz prüfen. EU-Sanktionen gegen Medien beachten (`data/sanctioned_media.csv`).

---

## 11. Nicht tun

- Keine medienspezifischen Scraper oder Sonderlogik im Code.
- Keine Teaser, Bilder, Volltexte aus Feeds speichern oder anzeigen.
- Keine Tracking-Cookies; falls Analytics, dann cookielos.
- Keine Koordinaten raten – lieber Warnung im Report.
- Kein generisches „Dashboard“-Design mit Standard-Map-Kacheln und Default-Popups. Wenn es aussieht wie ein Template, ist es falsch.
