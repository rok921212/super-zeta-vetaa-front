# Game-feed fixtures (:10086)

Captured from the game-feed server logs (`D:\code\log`, 2026-10-25..28) and sanitized:
player names → `P<n>`, team names → `Team <teamId>`, player ids remapped consistently
across endpoints (so killinfo/assist/revive uids still match `gettotalplayerlist`), `picUrl` blanked.
POST bodies came from Node `util.inspect` logs, so nested arrays deeper than 2 levels
appear as the string `"[Array truncated]"`.

Regenerate with `front/scripts/feed-audit/` (see its README).

- `getcircleinfo.json` — GET, 228 B
- `getgameglobalinfo.json` — GET, 127 B
- `getobservingplayer.json` — GET, 174 B
- `getplayerweapondetailinfo.json` — GET, 11645 B
- `gettotalplayerlist.json` — GET, 93606 B
- `setairdropboxinfo.json` — POST, 610 B
- `setcircleinfo.json` — POST, 202 B
- `setentertopeightafterrevive.json` — POST, 164 B
- `setgameglobalinfo.json` — POST, 365 B
- `setkillinfo.json` — POST, 292 B
- `setobservingplayer.json` — POST, 146 B
- `setplayerassistinfo.json` — POST, 250 B
- `setplayerdeadafterrevive.json` — POST, 213 B
- `setplayersaminfo.json` — POST, 198 B
- `setplayerssightusageinfo.json` — POST, 11961 B
- `setplayerweapondetailinfo.json` — POST, 3588 B
- `setplayerweaponinfo.json` — POST, 139 B
- `setreviveplayer.json` — POST, 264 B
- `setteambackpackinfo.json` — POST, 4131 B
