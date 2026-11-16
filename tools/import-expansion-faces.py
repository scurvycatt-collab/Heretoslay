#!/usr/bin/env python3
"""Build mapped complete-face packs for the WD / BN / DS expansions.

Input: the owner's `assets/cards/Expansion` folder (outside the repo), using each set's
`restored-png/` images and `restoration-manifest.json` (source face sha256 -> restored file).
Mapping to definitionId goes through the sha256 of the reviewed source face recorded in
apps/worker/src/content/expansion-drafts.ts, never through file order or names.

Output: assets/cards/expansions/<set>/faces/{manifest.json,cards/*.webp}, WebP q90 at the
template size (poker 745x1040, tarot 827x1417) so the art-window crop matches base cards.

Usage: python3 tools/import-expansion-faces.py "<path to Expansion folder>"
"""
import hashlib, json, re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SETS = {
    "warriorsDruids": ("Warrior & Druid", "warriors-druids", "Warriors & Druids"),
    "berserkersNecromancers": ("Berserker & Necromancer", "berserkers-necromancers", "Berserkers & Necromancers"),
    "dragonSorcerer": ("Dragon & Sorcerer", "dragon-sorcerer", "Dragon & Sorcerer"),
}
RIGHTS = "FAN_MADE_NON_COMMERCIAL"
CONTACT = "scurvycatt@gmail.com"


def drafts():
    text = (ROOT / "apps/worker/src/content/expansion-drafts.ts").read_text(encoding="utf8")
    rows = []
    for block in re.findall(r"\{\s*setKey:.*?\n  \},", text, re.S):
        get = lambda key: re.search(rf'{key}: "([^"]+)"', block).group(1)
        rows.append({k: get(k) for k in ("setKey", "definitionId", "kind", "canonicalName", "sha256")})
    return rows


def main(source_root: Path):
    rows = drafts()
    for set_key, (folder, slug, label) in SETS.items():
        src = source_root / folder / "restored-png"
        restored = json.loads((src / "restoration-manifest.json").read_text(encoding="utf-8-sig"))
        by_source_sha = {(card.get("sourceSha256") or card["sourceHash"]).lower(): card.get("file") or card["target"] for card in restored["cards"]}
        out = ROOT / "assets/cards/expansions" / slug / "faces"
        (out / "cards").mkdir(parents=True, exist_ok=True)
        assets = []
        for row in [r for r in rows if r["setKey"] == set_key]:
            file = by_source_sha.get(row["sha256"].lower())
            if not file:
                raise SystemExit(f"No restored face for {row['definitionId']}")
            tarot = row["kind"] in ("monster", "party_leader")
            size = (827, 1417) if tarot else (745, 1040)
            image = Image.open(src / file).convert("RGB").resize(size, Image.LANCZOS)
            rel = f"cards/{row['definitionId']}.webp"
            image.save(out / rel, "WEBP", quality=90, method=6)
            assets.append({
                "candidateId": f"{slug}-{Path(file).stem}",
                "definitionId": row["definitionId"],
                "variant": "default",
                "inputType": "complete_card_front",
                "renderMode": "complete_face",
                "template": "tarot" if tarot else "poker",
                "relativePath": rel,
                "sha256": hashlib.sha256((out / rel).read_bytes()).hexdigest(),
                "width": size[0], "height": size[1],
                "contentRect": {"x": 0, "y": 0, "width": size[0], "height": size[1]},
                "provenance": {
                    "origin": f"Owner folder · Expansion/{folder}/restored-png/{file}",
                    "sourceFaceSha256": row["sha256"],
                    "note": "Owner-restored copy of the reviewed source face (generative watermark removal); rules come from card data, not from this image.",
                    "rightsStatus": RIGHTS,
                },
                "rightsStatus": RIGHTS,
                "format": "webp",
            })
        manifest = {
            "schema": 1, "collection": label, "mode": "mapped", "gameplaySupported": True,
            "rightsStatus": RIGHTS, "takedownContact": CONTACT, "assets": assets,
        }
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
        print(f"{label}: {len(assets)} faces")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
