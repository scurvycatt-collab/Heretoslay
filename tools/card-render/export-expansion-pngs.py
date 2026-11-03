"""Export a scoped browser-acquisition index to 5100x6600 PNGs at 600 DPI.

No PDF generation, AI processing or game integration. Requires bundled Pillow.
"""
import argparse
import hashlib
import html
import json
import math
import shutil
import zipfile
from pathlib import Path
from urllib.parse import quote, unquote

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
HOST = "https://www.unstablegameswiki.com"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_index", type=Path)
    args = parser.parse_args()
    index = json.loads(args.source_index.read_text(encoding="utf-8"))
    out = ROOT / "assets/cards" / ("wiki-" + index["id"] + "-20261103")
    for sub in ["source-png", "png-600dpi", "previews"]:
        (out / sub).mkdir(parents=True, exist_ok=True)
    records, tiles = [], []
    contact = Image.new("RGB", (6 * 240, math.ceil(len(index["cards"]) / 6) * 340), "#e5e7eb")
    draw = ImageDraw.Draw(contact)
    for i, row in enumerate(index["cards"]):
        name, url_path = row[:2]
        filename = unquote(url_path.rsplit("/", 1)[1])
        source = Path.home() / "Downloads" / (row[3] if len(row) > 3 else filename)
        original = out / "source-png" / filename
        if original.exists() and sha(original) != sha(source):
            raise ValueError(f"Source changed, refusing overwrite: {original}")
        if not original.exists():
            shutil.copy2(source, original)
        with Image.open(original) as im:
            im.load()
            if im.format != "PNG":
                raise ValueError(f"Expected original PNG: {original}")
            native = list(im.size)
            rgba = im.convert("RGBA")
            rgb = Image.new("RGB", im.size, "white")
            rgb.paste(rgba, mask=rgba.getchannel("A"))
        scale = min(5100 / rgb.width, 6600 / rgb.height)
        w, h = round(rgb.width * scale), round(rgb.height * scale)
        x, y = (5100 - w) // 2, (6600 - h) // 2
        dest = out / "png-600dpi" / filename
        if not dest.exists():
            sheet = Image.new("RGB", (5100, 6600), "white")
            sheet.paste(rgb.resize((w, h), Image.Resampling.LANCZOS), (x, y))
            sheet.save(dest, dpi=(600, 600), compress_level=3)
        with Image.open(dest) as check:
            check.load()
            assert check.size == (5100, 6600), dest
            assert all(abs(d - 600) < 0.1 for d in check.info["dpi"]), dest
            preview = check.copy()
        preview.thumbnail((220, 285))
        preview_name = Path(filename).stem + ".jpg"
        preview.save(out / "previews" / preview_name, quality=92)
        cx, cy = (i % 6) * 240 + 10, (i // 6) * 340 + 10
        contact.paste(preview, (cx, cy))
        draw.text((cx, cy + 295), name, fill="black")
        suffix = row[2] if len(row) > 2 else name.replace(" ", "_")
        records.append({"name": name, "previewId": index["id"] + "-" + Path(filename).stem,
            "definitionId": None, "sourceUrl": HOST + url_path,
            "cardPage": HOST + "/index.php?title=Here_To_Slay_-_" + quote(suffix, safe="/()_-"),
            "filePage": HOST + "/index.php?title=File:" + quote(filename),
            "original": "source-png/" + filename, "sourceSha256": sha(original),
            "sourceWidth": native[0], "sourceHeight": native[1],
            "png": "png-600dpi/" + filename, "sha256": sha(dest),
            "width": 5100, "height": 6600, "dpi": 600,
            "contentRect": {"x": x, "y": y, "width": w, "height": h},
            "rightsStatus": "UNVERIFIED"})
        tiles.append(f'<article><a href="png-600dpi/{filename}"><img src="previews/{preview_name}" alt="{html.escape(name)}" loading="lazy"></a><h2>{html.escape(name)}</h2><a href="png-600dpi/{filename}" download>PNG 5100 × 6600</a> · <a href="source-png/{filename}" download>PNG gốc</a></article>')
        print(f'PASS {index["id"]} {i+1}/{len(index["cards"])}: {name}', flush=True)
    assert len({c["png"] for c in records}) == len(records)
    manifest = {"schema": 1, "acquiredOn": "2026-11-03", "collection": index["title"],
        "sourcePage": index["sourcePage"], "cardCount": len(records),
        "selection": "Full card faces linked by the deck; exclude Leader playmat versions. One image per unique listed card page, not physical copy count.",
        "processing": "Lanczos resize, preserve aspect ratio, centered on white 5100x6600 canvas, PNG 600-DPI metadata; no AI, sharpening, text or watermark edits.",
        "pdfStatus": index["pdfStatus"], "rightsStatus": "UNVERIFIED", "gameplaySupported": False,
        "cards": records}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(args.source_index, out / "source-index.json")
    contact.save(out / "contact-sheet.jpg", quality=93)
    (out / "README.md").write_text(f'# {index["title"]}\n\nOwner: Codex. Acquired 2026-11-03 from {index["sourcePage"]}.\n\n{len(records)} unique listed card faces, excluding Leader playmats. One PNG per card page; this is not a physical-copy inventory.\n\n- source-png/: unchanged original downloads.\n- png-600dpi/: 5100 x 6600 pixels, 600-DPI PNG metadata, full card centered on white letter canvas with original aspect ratio.\n- manifest.json: source URLs, source/output hashes, native sizes and content rectangles.\n- index.html, previews/, contact-sheet.jpg: local gallery and visual review.\n\n{index["pdfStatus"]} No PDFs were generated, per owner instruction.\n\nLarger dimensions do not recover source detail. No AI restoration, sharpening, content, typography, icon or watermark edits. Rights UNVERIFIED; no gameplay mapping, publishing or deployment.\n\nReproduce with bundled Python/Pillow: `python tools/card-render/export-expansion-pngs.py "{args.source_index.as_posix()}"`. Requires the browser downloads in the current user Downloads folder.\n', encoding="utf-8")
    (out / "index.html").write_text('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(index["title"])+'</title><style>body{font:16px system-ui;margin:32px;background:#10161b;color:#edf2f7}a{color:#8dd6ff}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:24px}article{background:#202b35;padding:16px;border-radius:12px}img{width:100%;height:300px;object-fit:contain}h2{font-size:18px}</style><h1>'+html.escape(index["title"])+'</h1><p>'+str(len(records))+' mẫu thẻ. PNG 5100 × 6600 px, 600 DPI; giữ tỷ lệ và đầy đủ nội dung, thêm lề trắng. Kèm PNG gốc; không xử lý AI. Không tạo PDF.</p><p>Rights UNVERIFIED. Chưa tích hợp gameplay.</p><main>'+"".join(tiles)+'</main></html>', encoding="utf-8")
    archive = out.with_suffix(".zip")
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as z:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(out.parent))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert not any(n.lower().endswith(".pdf") for n in z.namelist())
        file_count = len(z.namelist())
    print(json.dumps({"complete": index["id"], "cards": len(records), "zipBytes": archive.stat().st_size,
        "zipFiles": file_count, "zipSha256": sha(archive), "CRC": "PASS"}), flush=True)


if __name__ == "__main__":
    main()
