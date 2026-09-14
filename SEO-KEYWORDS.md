# SEO keyword map — alexandrisstores.gr

Written 2026-09-14, launch week, after the move to the real domain and the naming rule
(ALEXANDRIS = wordmark; Καταστήματα Αλεξανδρής / Alexandris Stores = the name). This is the
*why* behind every title, description and block of copy on the site. Edit the copy on
`/admin/categories`, `/admin/collections` and `/admin/seo`; edit brand copy in
`lib/seo/brand-content.ts`; edit chrome-page titles in `messages/el.json` + `en.json` (`Pages`).

## Strategy in one paragraph

Greek is the ranking language — the catalogue is Greek and Google Greece is the market. The
English words Greeks actually type (sneakers, loafers, boots, oxford, slingback, mules,
cowboy, chelsea) go into Greek titles as-is, because that is how the searches are phrased.
Every commercial page carries three things the big Greek shoe e-shops (Tsakiris Mallas,
Migato, Fratelli Petridi) do not: real buying-guide copy with sizes/materials/brands, an
FAQ block (rendered + FAQPage schema → rich results and AI answers), and the local layer
(Ηράκλειο, Έβανς 9, hours, since 1984). Every fact in the copy was checked against the
live catalogue on the day it was written — see `data/seo-content/*.json` `_readme`.

## Head terms → pages

| Query cluster (Greek first) | Page | Title (before " \| Alexandris Stores") |
|---|---|---|
| παπούτσια Ηράκλειο · κατάστημα παπουτσιών Ηράκλειο · shoe store Heraklion · παπούτσια online | `/` | Παπούτσια Ηράκλειο & Online – Γυναικεία & Ανδρικά (brand in-line, no suffix) |
| γυναικεία παπούτσια · γυναικεία παπούτσια online | `/women` | Γυναικεία Παπούτσια – Μπότες, Sneakers, Πέδιλα, Γόβες |
| ανδρικά παπούτσια · ανδρικά δερμάτινα παπούτσια · ανατομικά παπούτσια ανδρικά | `/men` | Ανδρικά Παπούτσια – Δερμάτινα Sneakers, Loafers, Μποτάκια |
| γυναικεία sneakers · λευκά sneakers γυναικεία · δίσολα sneakers · Fila γυναικεία | `/category/gynaikeia-sneakers` | Γυναικεία Sneakers – Fila, Δίσολα, Ανατομικά |
| γυναικείες μπότες · μποτάκια γυναικεία · μποτάκια cowboy · μπότες με τακούνι | `/category/gynaikeia-boots` | Γυναικείες Μπότες & Μποτάκια – Cowboy, Τακούνι |
| γυναικεία loafers · μοκασίνια γυναικεία · loafers σουέντ | `/category/gynaikeia-loafers` | Γυναικεία Loafers & Μοκασίνια Νο 36–41 |
| γόβες · παπούτσια με τακούνι · slingback · mules · νυφικά παπούτσια | `/category/heels` | Γόβες & Παπούτσια με Τακούνι – Slingback, Mules |
| γυναικεία πέδιλα · σανδάλια γυναικεία · πέδιλα με τακούνι · flat πέδιλα · δερμάτινα πέδιλα | `/category/sandals` | Γυναικεία Πέδιλα & Σανδάλια – Flat & με Τακούνι |
| ανδρικά sneakers · ανδρικά δερμάτινα sneakers · ανατομικά sneakers · U.S. Polo sneakers | `/category/andrika-sneakers` | Ανδρικά Sneakers – Δερμάτινα & Ανατομικά |
| ανδρικά loafers · ανδρικά μοκασίνια · δερμάτινα μοκασίνια | `/category/andrika-loafers` | Ανδρικά Loafers & Μοκασίνια – Δερμάτινα |
| ανδρικά μποτάκια · chelsea boots ανδρικά · ανδρικές μπότες δερμάτινες | `/category/andrika-boots` | Ανδρικά Μποτάκια – Δερμάτινα Chelsea & Derby |
| ανδρικά αμπιγιέ · δετά παπούτσια · oxford παπούτσια · παπούτσια για κοστούμι · παπούτσια γάμου ανδρικά | `/category/oxfords` | Ανδρικά Αμπιγιέ & Δετά Παπούτσια – Δερμάτινα |
| γυναικείες τσάντες · τσάντες Guess · Valentino bags · τσάντες Desigual · πορτοφόλια Guess | `/category/tsantes` | Γυναικείες Τσάντες – Guess, Valentino, Desigual |
| καθημερινά παπούτσια · άνετα παπούτσια | `/collections/everyday-essentials` | Καθημερινά Παπούτσια – Sneakers, Loafers & Flat |
| νέες αφίξεις παπούτσια · νέα συλλογή | `/collections/new-arrivals`, `/new-in` | Νέες Αφίξεις – … |
| βραδινά παπούτσια · παπούτσια γάμου καλεσμένη · παπούτσια βάφτισης | `/collections/evening-heels` | Βραδινά Παπούτσια – Γόβες & Πέδιλα με Τακούνι |
| μπότες μποτάκια χειμώνας | `/collections/boots-booties` | Μπότες & Μποτάκια – Γυναικεία & Ανδρικά |
| προσφορές παπούτσια · εκπτώσεις παπούτσια | `/sale` | Προσφορές σε Παπούτσια – Εκπτώσεις |
| {brand} παπούτσια / τσάντες | `/brands/{slug}` | per-brand, `lib/seo/brand-content.ts` |
| οδηγός μεγεθών παπουτσιών · νούμερα παπουτσιών EU UK US | `/size-guide` | Οδηγός Μεγεθών Παπουτσιών – Πίνακας EU, UK, US & Εκατοστά |
| μεταφορικά · επιστροφές · δωρεάν επιστροφή | `/shipping-returns`, `/faq` | see `messages` |

## Rules that keep it working

- **Title budget**: ≤ 48 characters before the suffix; the suffix `| Alexandris Stores` is
  added by the layout template. Keyword first, brand last, so truncation never eats the query.
- **Description budget**: ≤ 158 characters, one concrete promise (sizes / brands / delivery /
  returns), never a slogan.
- **H1 ≠ title.** H1 is the short human name (`Γυναικεία Παπούτσια`), the `<title>` carries
  the modifiers. Chrome pages use `*MetaTitle` keys for that reason.
- **FAQ = schema.** A FAQ is emitted as `FAQPage` only when the same questions are on the
  page (`resolveCategorySeo` / brand page). Never add schema-only questions.
- **No invented facts.** Sizes, materials, brands and policies in copy come from the
  catalogue and `constants/company.ts`. If stock changes materially (a brand leaves, a new
  size run), update the copy — the SEO audit at `/admin/seo/audit` will not catch a stale claim.
- **Local layer** lives in `constants/company.ts` (`store.openingHours`, `foundingYear`;
  `geo` still empty — OWNER: add coordinates from Google Maps) and flows into the
  ShoeStore/Organization schema, `llms.txt`, and category FAQs.
- **AI assistants** read `/llms.txt` (map) and `/llms-full.txt` (map + every guide, FAQ and
  policy inlined). Both are generated from the same rows the pages use — nothing to maintain.

## Not done, deliberately

- **English URLs / hreflang** — decided against for launch (Greek catalogue; a `/en` tree
  means translating 223 products). English is woven into Greek titles and the `en` chrome.
- **Product-level rewrites** — the 223 descriptions were rewritten on 2026-09-13; product
  titles follow `{brand} {type} {material} {colour} – κωδικός {sku}` for Skroutz/Merchant.
- **Journal expansion** — 14 articles exist; the next high-value pieces are "παπούτσια
  γάμου καλεσμένη", "ανατομικά παπούτσια για ορθοστασία", "νούμερα παιδικών"—if the shop
  ever stocks children's.
