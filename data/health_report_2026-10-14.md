# Abnahme Laufbetrieb – Stand 2026-10-14

Daten vom Branch `data` (Stand 2026-10-14 05:48 UTC). Nur Analyse – an Medien, Feeds und Code wurde nichts geändert.

## Zusammenfassung
- 1.881 Quellen, 1.654 mit Feed, 227 `no_feed`. Zustände: ok 1.528, stale 42, failing 12, dead 72.
- Gesamt-Erfolgsquote **93,6 %** über 203,349 Abrufe (Summe `runs` aller Quellen; 93.6 % aus `successes`). Ausgangswert 2026-10-07: 94,9 % über 11.388 Abrufe, 956 von 1.019 Feeds ok.
- Problemfälle (Health-Report): tot 72 (Ausgang 17), unerreichbar 12 (10), blockiert 2 (18), gedrosselt 3 (11), veraltet 42, HTTP 404: 1, HTTP 200 ohne Items: 4, < 50 % Erfolg: 3.
- Blockiert und gedrosselt sind deutlich weniger geworden, „tot“ deutlich mehr – 72 tote Feeds sind der Hauptbefund. Teilweise liegt das an den vielen seit 07.10. neu aufgenommenen Medien (Welle 6), die dem GitHub-Rechner dauerhaft 403/429/Timeout liefern (siehe CLAUDE.md, „17 neue Quellen …“).
- **Beobachtungsdauer:** 1.017 Quellen werden seit 2026-10-07 beobachtet (volle Woche, Abnahme fällig), 637 Quellen erst seit 2026-10-09 (5 Tage – Abnahme noch nicht fällig). Die automatische Zeile „observed for less than a week: 1654 of 1654“ des Health-Reports ist knapp daneben, weil die Woche (7 Tage ab 07.10. 12:18 UTC) um wenige Stunden unterschritten wird.

## Taktprüfung
Beobachtungszeitraum seit `since`: 2026-10-07 12:18 bis 2026-10-14 05:48 UTC ≈ 6,7 Tage.

| Tier | Quellen mit Runs | Runs min / Median / max | Erwartung | Urteil |
|---|---|---|---|---|
| 1 | 213 | 214 / 337 / 349 | 48/Tag → ~320 (Quellen seit 07.10.) bzw. ~240 (seit 09.10.) | Takt eingehalten; Median 337 ≈ 50/Tag |
| 2 | 524 | 107 / 167 / 187 | 24/Tag → ~160 | eingehalten |
| 3 | 917 | 43 / 69 / 85 | ~9,6/Tag → ~64 | eingehalten |

Der Worker-Takt (alle 15 Min.) hat also fast lückenlos getragen; der Rückfall im Vergleich zu den vorher berichteten 45 von 48 ausgefallenen Läufen ist nicht mehr zu sehen. Niedrigere Minima stammen von später aufgenommenen Quellen (`since` 09.10.). `gh run list` war nicht möglich (`gh` nicht authentifiziert: Token ungültig) – Läufe pro Tag deshalb nicht ausgewertet.


## Tot (≥10 Fehler in Folge) (72)

| id | Name | Land | Tier | Problem | Erfolg | Fehler in Folge | Beobachtet seit | letzter Fehler |
|---|---|---|---|---|---|---|---|---|
| dnevnik | Dnevnik | BG | 1 | dead | 0% | 348 | 2026-10-07 | HTTP 403 |
| thetimesofisrael | The Times of Israel | IL | 1 | dead | 0% | 334 | 2026-10-07 | HTTP 403 |
| theindianexpress | The Indian Express | IN | 1 | dead | 0% | 332 | 2026-10-07 | HTTP 403 |
| theirrawaddy | The Irrawaddy | MM | 1 | dead | 0% | 332 | 2026-10-07 | HTTP 403 |
| chinatimes-tw | China Times | TW | 1 | dead | 0% | 332 | 2026-10-07 | HTTP 403 |
| politico | Politico | US | 1 | dead | 0% | 341 | 2026-10-07 | HTTP 403 |
| sanfranciscochronicle | San Francisco Chronicle | US | 1 | dead | 0% | 341 | 2026-10-07 | no items |
| thedallasmorningnews | The Dallas Morning News | US | 1 | dead | 0% | 341 | 2026-10-07 | no items |
| theseattletimes | The Seattle Times | US | 1 | dead | 0% | 341 | 2026-10-07 | HTTP 202 |
| thewashingtontimes | The Washington Times | US | 1 | dead | 0% | 341 | 2026-10-07 | HTTP 403 |
| reportaz | Report.az | AZ | 2 | dead | 0% | 166 | 2026-10-07 | HTTP 403 |
| bangladeshpratidin | Bangladesh Pratidin | BD | 2 | dead | 0% | 170 | 2026-10-07 | HTTP 403 |
| mediapool | Mediapool | BG | 2 | dead | 0% | 107 | 2026-10-09 | HTTP 403 |
| stgallertagblatt | St. Galler Tagblatt | CH | 2 | dead | 2% | 93 | 2026-10-09 | HTTP 403 |
| madamasr | Mada Masr | EG | 2 | dead | 0% | 172 | 2026-10-07 | HTTP 403 |
| dernieresnouvellesdalsace | Dernières Nouvelles d'Alsace | FR | 2 | dead | 56% | 14 | 2026-10-09 | RemoteProtocolError |
| ledauphinelibere | Le Dauphiné libéré | FR | 2 | dead | 16% | 51 | 2026-10-09 | RemoteProtocolError |
| eleftherostypos | Eleftheros Typos | GR | 2 | dead | 0% | 107 | 2026-10-09 | HTTP 403 |
| mingpao | Ming Pao | HK | 2 | dead | 0% | 170 | 2026-10-07 | HTTP 403 |
| telex | Telex | HU | 2 | dead | 22% | 23 | 2026-10-07 | HTTP 403 |
| mediaindonesia | Media Indonesia | ID | 2 | dead | 0% | 170 | 2026-10-07 | HTTP 403 |
| loksatta | Loksatta | IN | 2 | dead | 0% | 170 | 2026-10-07 | HTTP 404 |
| sakshi | Sakshi | IN | 2 | dead | 0% | 170 | 2026-10-07 | HTTP 403 |
| thefinancialexpress | The Financial Express | IN | 2 | dead | 0% | 170 | 2026-10-07 | HTTP 403 |
| almada | Al-Mada | IQ | 2 | dead | 0% | 172 | 2026-10-07 | HTTP 403 |
| thephnompenhpost | The Phnom Penh Post | KH | 2 | dead | 0% | 166 | 2026-10-07 | HTTP 403 |
| telquel | Telquel | MA | 2 | dead | 0% | 172 | 2026-10-07 | HTTP 403 |
| pobjeda | Pobjeda | ME | 2 | dead | 0% | 107 | 2026-10-09 | HTTP 403 |
| maltatoday | MaltaToday | MT | 2 | dead | 0% | 163 | 2026-10-07 | HTTP 403 |
| mileniodiario | Milenio Diario | MX | 2 | dead | 0% | 175 | 2026-10-07 | HTTP 403 |
| thesun | The Sun | NG | 2 | dead | 0% | 167 | 2026-10-07 | HTTP 403 |
| laprensa-ni | La Prensa | NI | 2 | dead | 0% | 175 | 2026-10-07 | HTTP 403 |
| alquds | Al-Quds | PS | 2 | dead | 0% | 172 | 2026-10-07 | HTTP 403 |
| thairath | Thairath | TH | 2 | dead | 0% | 170 | 2026-10-07 | HTTP 403 |
| chinadailynews | China Daily News | TW | 2 | dead | 0% | 170 | 2026-10-07 | HTTP 403 |
| sanantonioexpressnews | San Antonio Express-News | US | 2 | dead | 0% | 179 | 2026-10-07 | no items |
| thechicagodefender | The Chicago Defender | US | 2 | dead | 0% | 179 | 2026-10-07 | HTTP 403 |
| bvz | BVZ | AT | 3 | dead | 0% | 44 | 2026-10-09 | HTTP 404 |
| noen | NÖN | AT | 3 | dead | 0% | 44 | 2026-10-09 | HTTP 404 |
| aargauerzeitung | Aargauer Zeitung | CH | 3 | dead | 2% | 41 | 2026-10-09 | HTTP 403 |
| luzernerzeitung | Luzerner Zeitung | CH | 3 | dead | 2% | 41 | 2026-10-09 | HTTP 403 |
| aachenerzeitung | Aachener Zeitung | DE | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| nordlysid | Norðlýsið | DK | 3 | dead | 0% | 43 | 2026-10-09 | HTTP 403 |
| elprogreso | El Progreso | ES | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| eleftheria | Eleftheria | GR | 3 | dead | 0% | 43 | 2026-10-09 | HTTP 403 |
| rodiaki | Rodiaki | GR | 3 | dead | 0% | 43 | 2026-10-09 | HTTP 403 |
| dubrovackivjesnik | Dubrovački vjesnik | HR | 3 | dead | 0% | 43 | 2026-10-09 | HTTP 403 |
| novosti | Novosti | HR | 3 | dead | 0% | 43 | 2026-10-09 | HTTP 403 |
| cdm | CdM | ME | 3 | dead | 42% | 16 | 2026-10-09 | HTTP 403 |
| alroiya | Al-Roiya | OM | 3 | dead | 6% | 68 | 2026-10-07 | HTTP 403 |
| gazetadesud | Gazeta de Sud | RO | 3 | dead | 0% | 43 | 2026-10-09 | HTTP 403 |
| tribuna | Tribuna | RO | 3 | dead | 0% | 43 | 2026-10-09 | HTTP 403 |
| 0312ua | 0312.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0332ua | 0332.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0342ua | 0342.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0362ua | 0362.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0372ua | 0372.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0412ua | 0412.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0432ua | 0432.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0462ua | 0462.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0472ua | 0472.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0512comua | 0512.com.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0522ua | 0522.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0532ua | 0532.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0542ua | 0542.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 0552ua | 0552.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 056ua | 056.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 057ua | 057.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| 061ua | 061.ua | UA | 3 | dead | 0% | 48 | 2026-10-09 | HTTP 403 |
| newhavenregister | New Haven Register | US | 3 | dead | 0% | 77 | 2026-10-07 | no items |
| thestthomassource | The St. Thomas Source | US | 3 | dead | 0% | 43 | 2026-10-09 | HTTP 403 |
| reporteri | Reporteri | XK | 3 | dead | 58% | 18 | 2026-10-09 | HTTP 403 |


## Unerreichbar (12)

| id | Name | Land | Tier | Problem | Erfolg | Fehler in Folge | Beobachtet seit | letzter Fehler |
|---|---|---|---|---|---|---|---|---|
| actualitecd | Actualite.cd | CD | 2 | unreachable | 89% | 1 | 2026-10-07 | ReadTimeout |
| jeunessedalgerie | Jeunesse d'Algérie | DZ | 3 | unreachable | 89% | 1 | 2026-10-07 | ReadTimeout |
| leprogres | Le Progrès | FR | 3 | unreachable | 65% | 6 | 2026-10-07 | RemoteProtocolError |
| andamansheekha | Andaman Sheekha | IN | 3 | unreachable | 80% | 2 | 2026-10-07 | ConnectTimeout |
| gujaratmitra | Gujarat Mitra | IN | 3 | unreachable | 14% | 5 | 2026-10-07 | ConnectTimeout |
| okno | Okno | MK | 3 | unreachable | 95% | 1 | 2026-10-09 | ReadTimeout |
| lavozdelsureste | La Voz del Sureste | MX | 3 | unreachable | 67% | 2 | 2026-10-07 | ConnectTimeout |
| diariodosacores | Diário dos Açores | PT | 3 | unreachable | 49% | 2 | 2026-10-09 | ReadTimeout |
| monitoruldebotosani | Monitorul de Botoșani | RO | 3 | unreachable | 81% | 2 | 2026-10-09 | ReadTimeout |
| alfurat | Al-Furat | SY | 3 | unreachable | 36% | 5 | 2026-10-07 | ConnectTimeout |
| aljamahir | Al-Jamahir | SY | 3 | unreachable | 36% | 5 | 2026-10-07 | ConnectTimeout |
| saipantribune | Saipan Tribune | US | 3 | unreachable | 12% | 4 | 2026-10-07 | ReadTimeout |


## Blockiert (401/403/451) (2)

| id | Name | Land | Tier | Problem | Erfolg | Fehler in Folge | Beobachtet seit | letzter Fehler |
|---|---|---|---|---|---|---|---|---|
| hvg | HVG | HU | 2 | blocked | 67% | 1 | 2026-10-07 | HTTP 403 |
| newsday-zw | NewsDay | ZW | 2 | blocked | 35% | 1 | 2026-10-07 | HTTP 403 |


## Gedrosselt (429) (3)

| id | Name | Land | Tier | Problem | Erfolg | Fehler in Folge | Beobachtet seit | letzter Fehler |
|---|---|---|---|---|---|---|---|---|
| theindependent | The Independent | GB | 2 | rate-limited | 12% | 8 | 2026-10-07 | HTTP 429 |
| evenimentulzilei | Evenimentul zilei | RO | 2 | rate-limited | 23% | 8 | 2026-10-09 | HTTP 429 |
| thebuffalonews | The Buffalo News | US | 2 | rate-limited | 32% | 4 | 2026-10-07 | HTTP 429 |


## Veraltet/verwaist (42)

| id | Name | Land | Tier | Problem | Erfolg | Fehler in Folge | Beobachtet seit | letzter Fehler |
|---|---|---|---|---|---|---|---|---|
| nepszava | Népszava | HU | 1 | stale | 100% | 0 | 2026-10-07 |  |
| abidjannet | Abidjan.net | CI | 2 | stale | 87% | 0 | 2026-10-07 |  |
| lapinkansa | Lapin Kansa | FI | 2 | stale | 100% | 0 | 2026-10-09 |  |
| 24kg | 24.kg | KG | 2 | stale | 100% | 0 | 2026-10-07 |  |
| lesothotimes | Lesotho Times | LS | 2 | stale | 98% | 0 | 2026-10-07 |  |
| cridemorg | Cridem.org | MR | 2 | stale | 100% | 0 | 2026-10-07 |  |
| turkiyegazetesi | Türkiye Gazetesi | TR | 2 | stale | 100% | 0 | 2026-10-07 |  |
| stlouispostdispatch | St. Louis Post-Dispatch | US | 2 | stale | 76% | 0 | 2026-10-07 |  |
| antiguaobserver | Antigua Observer | AG | 3 | stale | 97% | 0 | 2026-10-07 |  |
| lamananadecordoba | La Mañana de Córdoba | AR | 3 | stale | 100% | 0 | 2026-10-07 |  |
| alayam | Al Ayam | BH | 3 | stale | 100% | 0 | 2026-10-07 |  |
| scoop | Scoop | BN | 3 | stale | 99% | 0 | 2026-10-07 |  |
| thebhutanese | The Bhutanese | BT | 3 | stale | 97% | 0 | 2026-10-07 |  |
| amandala | Amandala | BZ | 3 | stale | 100% | 0 | 2026-10-07 |  |
| leclaireurprogres | L'Éclaireur Progrès | CA | 3 | stale | 78% | 0 | 2026-10-07 |  |
| stcatharinesstandard | St. Catharines Standard | CA | 3 | stale | 60% | 0 | 2026-10-07 |  |
| laconscience | La Conscience | CD | 3 | stale | 100% | 0 | 2026-10-07 |  |
| lobservateur | L'Observateur | CD | 3 | stale | 87% | 0 | 2026-10-07 |  |
| ethiopiainsight | Ethiopia Insight | ET | 3 | stale | 100% | 0 | 2026-10-07 |  |
| janamsakshi | Janam Sakshi | IN | 3 | stale | 97% | 0 | 2026-10-07 |  |
| sanjhikhabar | Sanjhi Khabar | IN | 3 | stale | 100% | 0 | 2026-10-07 |  |
| theexaminer | The Examiner | LK | 3 | stale | 100% | 0 | 2026-10-07 |  |
| namibiansun | Namibian Sun | NA | 3 | stale | 100% | 0 | 2026-10-07 |  |
| idlreporteros | IDL-Reporteros | PE | 3 | stale | 100% | 0 | 2026-10-07 |  |
| gazetawyborczatorun | Gazeta Wyborcza Toruń | PL | 3 | stale | 69% | 0 | 2026-10-09 |  |
| snoop | Snoop | RO | 3 | stale | 100% | 0 | 2026-10-09 |  |
| hrvatskarijec | Hrvatska riječ | RS | 3 | stale | 100% | 0 | 2026-10-09 |  |
| krik | KRIK | RS | 3 | stale | 100% | 0 | 2026-10-09 |  |
| daimohk | Daimohk | RU | 3 | stale | 100% | 0 | 2026-10-07 |  |
| roslavlskayapravda | Roslavlskaya pravda | RU | 3 | stale | 100% | 0 | 2026-10-07 |  |
| thenorthernworkerseverodvinsk | The Northern Worker (Severodvinsk) | RU | 3 | stale | 100% | 0 | 2026-10-07 |  |
| vyborg | Vyborg | RU | 3 | stale | 99% | 0 | 2026-10-07 |  |
| nepujsag-si | Népújság | SI | 3 | stale | 100% | 0 | 2026-10-09 |  |
| prachatai | Prachatai | TH | 3 | stale | 100% | 0 | 2026-10-07 |  |
| vysokyizamok | Vysokyi Zamok | UA | 3 | stale | 96% | 0 | 2026-10-07 |  |
| marioncountyrecord | Marion County Record | US | 3 | stale | 97% | 0 | 2026-10-07 |  |
| nomenugget | Nome Nugget | US | 3 | stale | 100% | 0 | 2026-10-07 |  |
| pointreyeslight | Point Reyes Light | US | 3 | stale | 100% | 0 | 2026-10-07 |  |
| thecall | The Call | US | 3 | stale | 95% | 0 | 2026-10-07 |  |
| thenewssentinel | The News-Sentinel | US | 3 | stale | 100% | 0 | 2026-10-07 |  |
| thespokesmanreview | The Spokesman-Review | US | 3 | stale | 83% | 0 | 2026-10-07 |  |
| searchlight | Searchlight | VC | 3 | stale | 100% | 0 | 2026-10-07 |  |


## HTTP 404 (1)

| id | Name | Land | Tier | Problem | Erfolg | Fehler in Folge | Beobachtet seit | letzter Fehler |
|---|---|---|---|---|---|---|---|---|
| lesahel | Le Sahel | NE | 2 | error 404 | 82% | 8 | 2026-10-07 | HTTP 404 |


## Feed ohne Items / ungültig (HTTP 200) (4)

| id | Name | Land | Tier | Problem | Erfolg | Fehler in Folge | Beobachtet seit | letzter Fehler |
|---|---|---|---|---|---|---|---|---|
| houstonchronicle | Houston Chronicle | US | 1 | error 200 | 1% | 5 | 2026-10-07 | no items |
| austinamericanstatesman | Austin American-Statesman | US | 2 | error 200 | 14% | 3 | 2026-10-07 | no items |
| navajotimes | Navajo Times | US | 2 | error 200 | 56% | 1 | 2026-10-07 | no items |
| kashmirtimes | Kashmir Times | IN | 3 | error 200 | 34% | 5 | 2026-10-07 | no items |


## Erfolgsquote < 50 % (3)

| id | Name | Land | Tier | Problem | Erfolg | Fehler in Folge | Beobachtet seit | letzter Fehler |
|---|---|---|---|---|---|---|---|---|
| lapatilla | La Patilla | VE | 2 | low success | 15% | 0 | 2026-10-07 |  |
| bunaziuaiasi | Bună Ziua Iași | RO | 3 | low success | 30% | 0 | 2026-10-09 |  |
| ziarecom | Ziare.com | RO | 3 | low success | 47% | 0 | 2026-10-09 |  |


## Empfehlungen (nicht umgesetzt)

### A. Tier 3 ersetzen oder `drop` – volle Woche beobachtet (39)
Je Medium: Wenn es in einer Handliste `data/seed/<land>_manual.csv` steht → Zeile dort entfernen; sonst `drop` in `data/seed/candidates/decisions.csv`. Danach je Land `python scripts/refill_regional.py <Land>`. Vorher prüfen, dass der Feed nicht nur dem GitHub-Rechner gesperrt ist (`python scripts/check_feeds.py`) und bei „veraltet“ ob der Feed wirklich > 14 Tage still ist (`ABANDONED_HOURS`).

- `antiguaobserver` (AG, stale, 97%)
- `lamananadecordoba` (AR, stale, 100%)
- `alayam` (BH, stale, 100%)
- `scoop` (BN, stale, 99%)
- `thebhutanese` (BT, stale, 97%)
- `amandala` (BZ, stale, 100%)
- `leclaireurprogres` (CA, stale, 78%)
- `stcatharinesstandard` (CA, stale, 60%)
- `laconscience` (CD, stale, 100%)
- `lobservateur` (CD, stale, 87%)
- `jeunessedalgerie` (DZ, unreachable, 89%)
- `ethiopiainsight` (ET, stale, 100%)
- `leprogres` (FR, unreachable, 65%)
- `andamansheekha` (IN, unreachable, 80%)
- `gujaratmitra` (IN, unreachable, 14%)
- `janamsakshi` (IN, stale, 97%)
- `sanjhikhabar` (IN, stale, 100%)
- `theexaminer` (LK, stale, 100%)
- `lavozdelsureste` (MX, unreachable, 67%)
- `namibiansun` (NA, stale, 100%)
- `alroiya` (OM, dead, 6%)
- `idlreporteros` (PE, stale, 100%)
- `daimohk` (RU, stale, 100%)
- `roslavlskayapravda` (RU, stale, 100%)
- `thenorthernworkerseverodvinsk` (RU, stale, 100%)
- `vyborg` (RU, stale, 99%)
- `alfurat` (SY, unreachable, 36%)
- `aljamahir` (SY, unreachable, 36%)
- `prachatai` (TH, stale, 100%)
- `vysokyizamok` (UA, stale, 96%)
- `marioncountyrecord` (US, stale, 97%)
- `newhavenregister` (US, dead, 0%)
- `nomenugget` (US, stale, 100%)
- `pointreyeslight` (US, stale, 100%)
- `saipantribune` (US, unreachable, 12%)
- `thecall` (US, stale, 95%)
- `thenewssentinel` (US, stale, 100%)
- `thespokesmanreview` (US, stale, 83%)
- `searchlight` (VC, stale, 100%)

### B. Tier 3 – erst seit 2026-10-09 beobachtet (41) – Abnahme noch nicht fällig
- `bvz` (AT, dead, 0%)
- `noen` (AT, dead, 0%)
- `aargauerzeitung` (CH, dead, 2%)
- `luzernerzeitung` (CH, dead, 2%)
- `aachenerzeitung` (DE, dead, 0%)
- `nordlysid` (DK, dead, 0%)
- `elprogreso` (ES, dead, 0%)
- `eleftheria` (GR, dead, 0%)
- `rodiaki` (GR, dead, 0%)
- `dubrovackivjesnik` (HR, dead, 0%)
- `novosti` (HR, dead, 0%)
- `cdm` (ME, dead, 42%)
- `okno` (MK, unreachable, 95%)
- `gazetawyborczatorun` (PL, stale, 69%)
- `diariodosacores` (PT, unreachable, 49%)
- `gazetadesud` (RO, dead, 0%)
- `monitoruldebotosani` (RO, unreachable, 81%)
- `snoop` (RO, stale, 100%)
- `tribuna` (RO, dead, 0%)
- `hrvatskarijec` (RS, stale, 100%)
- `krik` (RS, stale, 100%)
- `nepujsag-si` (SI, stale, 100%)
- `0312ua` (UA, dead, 0%)
- `0332ua` (UA, dead, 0%)
- `0342ua` (UA, dead, 0%)
- `0362ua` (UA, dead, 0%)
- `0372ua` (UA, dead, 0%)
- `0412ua` (UA, dead, 0%)
- `0432ua` (UA, dead, 0%)
- `0462ua` (UA, dead, 0%)
- `0472ua` (UA, dead, 0%)
- `0512comua` (UA, dead, 0%)
- `0522ua` (UA, dead, 0%)
- `0532ua` (UA, dead, 0%)
- `0542ua` (UA, dead, 0%)
- `0552ua` (UA, dead, 0%)
- `056ua` (UA, dead, 0%)
- `057ua` (UA, dead, 0%)
- `061ua` (UA, dead, 0%)
- `thestthomassource` (US, dead, 0%)
- `reporteri` (XK, dead, 58%)

### C. Tier 1/2 – bleiben grau (Prinzip 4), nur zur Kenntnis (52)
- `dnevnik` (BG, T1, dead)
- `nepszava` (HU, T1, stale)
- `thetimesofisrael` (IL, T1, dead)
- `theindianexpress` (IN, T1, dead)
- `theirrawaddy` (MM, T1, dead)
- `chinatimes-tw` (TW, T1, dead)
- `politico` (US, T1, dead)
- `sanfranciscochronicle` (US, T1, dead)
- `thedallasmorningnews` (US, T1, dead)
- `theseattletimes` (US, T1, dead)
- `thewashingtontimes` (US, T1, dead)
- `reportaz` (AZ, T2, dead)
- `bangladeshpratidin` (BD, T2, dead)
- `mediapool` (BG, T2, dead)
- `actualitecd` (CD, T2, unreachable)
- `stgallertagblatt` (CH, T2, dead)
- `abidjannet` (CI, T2, stale)
- `madamasr` (EG, T2, dead)
- `lapinkansa` (FI, T2, stale)
- `dernieresnouvellesdalsace` (FR, T2, dead)
- `ledauphinelibere` (FR, T2, dead)
- `theindependent` (GB, T2, rate-limited)
- `eleftherostypos` (GR, T2, dead)
- `mingpao` (HK, T2, dead)
- `hvg` (HU, T2, blocked)
- `telex` (HU, T2, dead)
- `mediaindonesia` (ID, T2, dead)
- `loksatta` (IN, T2, dead)
- `sakshi` (IN, T2, dead)
- `thefinancialexpress` (IN, T2, dead)
- `almada` (IQ, T2, dead)
- `24kg` (KG, T2, stale)
- `thephnompenhpost` (KH, T2, dead)
- `lesothotimes` (LS, T2, stale)
- `telquel` (MA, T2, dead)
- `pobjeda` (ME, T2, dead)
- `cridemorg` (MR, T2, stale)
- `maltatoday` (MT, T2, dead)
- `mileniodiario` (MX, T2, dead)
- `thesun` (NG, T2, dead)
- `laprensa-ni` (NI, T2, dead)
- `alquds` (PS, T2, dead)
- `evenimentulzilei` (RO, T2, rate-limited)
- `thairath` (TH, T2, dead)
- `turkiyegazetesi` (TR, T2, stale)
- `chinadailynews` (TW, T2, dead)
- `sanantonioexpressnews` (US, T2, dead)
- `thechicagodefender` (US, T2, dead)
- `thebuffalonews` (US, T2, rate-limited)
- `stlouispostdispatch` (US, T2, stale)
- `lapatilla` (VE, T2, low success)
- `newsday-zw` (ZW, T2, blocked)

Auffällig: Tier-1-Medien `theirrawaddy`, `dnevnik` (BG), `thetimesofisrael`, `nepszava` sind tot/veraltet – bei diesen lohnt trotzdem ein Blick, ob nur die URL gewechselt hat.

### D. Feeds neu suchen (HTTP 404 / ohne Items)

```
python scripts/discover_feeds.py --only houstonchronicle,austinamericanstatesman,navajotimes,kashmirtimes,lesahel
python scripts/check_feeds.py   # Netzprüfung der bisherigen URLs von hier aus
```

Zusätzlich für tote Tier-1/2-Feeds (URL evtl. umgezogen):
```
python scripts/discover_feeds.py --only dnevnik,thetimesofisrael,theindianexpress,theirrawaddy,chinatimes-tw,politico,sanfranciscochronicle,thedallasmorningnews,theseattletimes,thewashingtontimes,reportaz,bangladeshpratidin,mediapool,stgallertagblatt,madamasr,dernieresnouvellesdalsace,ledauphinelibere,eleftherostypos,mingpao,telex,mediaindonesia,loksatta,sakshi,thefinancialexpress,almada,thephnompenhpost,telquel,pobjeda,maltatoday,mileniodiario,thesun,laprensa-ni,alquds,thairath,chinadailynews,sanantonioexpressnews,thechicagodefender
```
