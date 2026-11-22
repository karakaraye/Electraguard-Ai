# Glossary: key terms in five languages

**Status:** draft · 22 Nov 2026 · non-English columns need the owner's review and correction.

Use exactly these words in every screen, message file, SMS/USSD text, guide and voice recording. If the owner changes a term here, change it in all five message files in the same commit.

| # | Meaning (for the translator) | English (en) | Naijá (pcm) | Hausa (ha) | Yorùbá (yo) | Igbo (ig) |
|---|---|---|---|---|---|---|
| 1 | One thing an observer or citizen tells us about | report | report | rahoto | ìròyìn | akụkọ |
| 2 | The short code shown after the server confirms a report (`EG-4H7Q-92KD`) | receipt code | receipt code | lambar rasiti | kóòdù ìjẹ́rìísí | koodu nnata |
| 3 | The code printed on the observer's card (`OBS-7K2P9D`) | observer code | observer code | lambar mai sa ido | kóòdù olùwòye | koodu onye nlebanya |
| 4 | The 6-digit secret number (the card carries a one-time 8-digit setup PIN) | PIN | PIN | PIN | PIN | PIN |
| 5 | The place where people vote | polling unit | polling unit | rumfar zaɓe | ibùdó ìdìbò | ebe ntuli aka |
| 6 | The area made of several polling units | ward | ward | mazaɓa | wọ́ọ̀dù | wọọdụ |
| 7 | The trained person who reads reports | reviewer | reviewer | mai dubawa | olùyẹ̀wò | onye nyocha |
| 8 | To take back a report before review starts (content deleted) | withdraw | withdraw (comot am) | janye | fà á sẹ́yìn | wepụ |
| 9 | Photos, video or voice notes added to a report | evidence | evidence (proof) | shaida | ẹ̀rí | ihe akaebe |
| 10 | Status: a reviewer asked something and waits for the reporter | Question for you | Question dey for you | Tambaya gare ka | Ìbéèrè fún ọ | Ajụjụ maka gị |
| 11 | Status: stored on the device, not sent | On this phone | E dey this phone | Yana kan wannan wayar | Ó wà lórí fóònù yìí | Ọ nọ na ekwentị a |
| 12 | Status: the server confirmed it has the report | Received | Dem don receive am | An karɓa | A ti gbà á | Anatala ya |
| 13 | Status: a reviewer is working on it | Being reviewed | Dem dey review am | Ana dubawa | À ń yẹ̀ ẹ́ wò | A na-enyocha ya |
| 14 | Mobile network signal | network | network | sabis (network) | nẹ́tíwọ̀ọ̀kì | netwọk |
| 15 | Someone could be hurt now | danger | danger | haɗari | ewu | ihe egwu |
| 16 | The accredited person who watches the election | observer | observer | mai sa ido | olùwòye | onye nlebanya |
| 17 | Any voter without an observer code | citizen | citizen (ordinary person) | ɗan ƙasa | ọmọ ìlú | nwa amaala |
| 18 | The person who invites and oversees discussions | moderator | moderator | mai kula da tattaunawa | alábòójútó ìjíròrò | onye nlekọta mkparịta ụka |
| 19 | The lead the observer reports to in their organisation | coordinator | coordinator | jagora | olùṣètò | onye nhazi |

## Rules for translators

- Natural speech over word-for-word. Short sentences. Reading age 9–11.
- Hausa: hooked letters ɓ ɗ ƙ and ʼy where needed. Yorùbá: full tone marks and under-dots (ẹ ọ ṣ). Igbo: dotted vowels ị ọ ụ and ṅ.
- Never translate codes, example values (`OBS-7K2P9D`, `EG-4H7Q-92KD`), `112`, `PIN`, or ICU variables (`{count}`, `{time}`).
- Keep ICU plural syntax intact; translate only the words inside each branch. Yorùbá and Igbo have no grammatical plural, but keep the `one`/`other` branches so the code works.
- "ElectraGuard" is never translated.
