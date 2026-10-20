# Home page content: `site.json`

Every word, price, link and image on the home page (`/`) comes from `site.json` in this folder.
The page fetches it on each visit, so editing it needs **no rebuild**: change the file, redeploy
the static files (or replace the file on the server), and reload.

## Rules
- Keep it valid JSON: double quotes, no trailing commas. Check it at <https://jsonlint.com> if unsure.
- A key you delete or break falls back to a built-in default (`src/content/fallback.ts`), so a
  typo never blanks the page. Lists (`items`, `plans`, `features`, `stats`) that are empty hide their section.
- Links: `#simulator`-style values scroll the page; `/login`-style values open an app page;
  `https://...` values open in a new tab.
- Images: a path in `front/public` (`./stats.avif`) or a full `https://` URL.

## Sections
| Key | What it is |
|---|---|
| `meta` | Brand name and the logos in the top-left corner. |
| `nav` | Top menu links and the Login button text. |
| `hero` | The big headline block: title, subtitle, two buttons, the four stat tiles, the side image. |
| `simulator` | The "Try it live" simulation: step titles and hints, button labels, desktop tool names. `stageBackground` can point at a clean gameplay screenshot (no overlays on it) shown behind the overlays; empty = dark backdrop. |
| `overlays` | The overlay module cards (image + title + text). |
| `pipeline` | The three "Ingest / Render / Deliver" steps. |
| `features` | Feature tiles. `icon` is one of `realTime`, `themes`, `broadcast`, `api`, `events`, `scoring`. |
| `projects` | Past broadcasts (YouTube link → thumbnail is automatic). |
| `pricing` | The plans. Each plan has `price.monthly` and `price.yearly` (`amount` + `period`), a `features` list and a `cta` button. `highlight: true` makes a card stand out; `badge` adds a tag on top. |
| `contact` | Email, WhatsApp and the free-trial box. |
| `footer` | Copyright line and the status text. |

The **teams, logos and colours** shown in the simulation are not in this file: the site admin picks
an event in the admin panel (**Home page** tab). Without one, the simulation uses built-in sample teams.
