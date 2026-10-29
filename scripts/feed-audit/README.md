# feed-audit

Scripts behind Milestone 1 of the Designer upgrade (`front/docs/designer-upgrade/m1-audit.md`).
They only read the game-feed logs and write JSON files. Each one streams its input, so a 4–5 GB log uses less than 50 MB of memory.

```sh
mkdir -p out/samples
# 1. inventory every endpoint (all logs ≈ 2 min); append :MB to a path to read only its head
node extract.cjs out D:/code/log/log-20261025.txt D:/code/log/log-20261026.txt D:/code/log/log-20261027.txt D:/code/log/log-20261028.txt
# 2. sanitized fixtures (names → P<n>, ids remapped consistently)
node sanitize.cjs out/samples ../../src/graphics/__fixtures__/feed
# 3. field-level audit (spec 2.2)
node audit.cjs out/inventory.json ../../docs/designer-upgrade/field-audit.json
```

`audit.cjs` contains a hand-written map of which fields are available where (proto wire, `live.ts`, `local.ts`). It was checked against the code on 2026-10-28. Update it whenever those files change.
