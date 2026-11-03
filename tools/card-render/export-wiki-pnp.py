"""Export the 27 explicitly linked wiki PnP PDFs without redrawing card content.

Run with the bundled Python runtime (Pillow + pypdf), with pdftoppm on PATH.
Downloads are supplied by the browser; this script does not crawl unrelated URLs.
"""
import argparse
import hashlib
import html
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader

PAGE = "https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_PnP_Pages"
BASE = ["c/c4", "9/91", "d/d2", "3/3c", "4/45", "0/0f", "3/39", "b/b2", "a/aa", "e/e1", "9/9b", "d/df", "b/b8", "d/dd", "1/11", "3/37", "4/46", "c/c3", "1/13"]
KSE = ["8/87", "d/d8", "6/64", "8/84", "d/d0", "1/18", "1/1f", "5/51"]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--downloads", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "assets/cards/wiki-pnp-20261103")
    parser.add_argument("--dpi", type=int, default=600, choices=[300, 600])
    args = parser.parse_args()
    root = args.output
    original = root / "source-pdf"
    rendered = root / f"sheets-{args.dpi}dpi"
    thumbs = root / "previews"
    for folder in [original, rendered, thumbs]:
        folder.mkdir(parents=True, exist_ok=True)
    records = []
    for group, prefix, folders in [("base", "HTSpnp_3.5.2020", BASE), ("kickstarter", "HTS_KSE_pnp_3.6.2020", KSE)]:
        for number, folder in enumerate(folders, 1):
            name = f"{prefix}-{number}.pdf"
            source = args.downloads / name
            pdf = original / name
            if not source.is_file():
                raise FileNotFoundError(source)
            if not source.read_bytes().startswith(b"%PDF-"):
                raise ValueError(f"Not a PDF: {source}")
            if pdf.exists() and sha(pdf) != sha(source):
                raise ValueError(f"Existing source differs; refusing overwrite: {pdf}")
            if not pdf.exists():
                shutil.copy2(source, pdf)
            reader = PdfReader(pdf)
            if len(reader.pages) != 1:
                raise ValueError(f"Expected one sheet: {pdf}")
            page = reader.pages[0]
            stem = f"{group}-{number:02d}"
            png = rendered / f"{stem}.png"
            if not png.exists():
                subprocess.run(["pdftoppm", "-r", str(args.dpi), "-singlefile", "-png", str(pdf), str(png.with_suffix(""))], check=True, capture_output=True)
            with Image.open(png) as im:
                im.verify()
            with Image.open(png) as im:
                size = list(im.size)
                expected = [round(float(page.mediabox.width) * args.dpi / 72), round(float(page.mediabox.height) * args.dpi / 72)]
                if any(abs(a - b) > 1 for a, b in zip(size, expected)):
                    raise ValueError(f"Unexpected dimensions: {png} {size} != {expected}")
                im.thumbnail((340, 440))
                im.convert("RGB").save(thumbs / f"{stem}.jpg", quality=90)
            records.append({"id": stem, "group": group, "pageNumber": number,
                "sourcePage": PAGE, "sourceUrl": f"https://unstablegameswiki.com/images/{folder}/{name}",
                "pdf": pdf.relative_to(root).as_posix(), "sourceSha256": sha(pdf),
                "png": png.relative_to(root).as_posix(), "sha256": sha(png),
                "width": size[0], "height": size[1], "dpi": args.dpi,
                "rightsStatus": "UNVERIFIED", "definitionId": None})
            print(f"Verified {stem}: {size[0]}x{size[1]}", flush=True)
    manifest = {"schema": 1, "acquiredOn": "2026-11-03", "sourcePage": PAGE,
        "rightsStatus": "UNVERIFIED", "assetType": "pnp-sheet", "processing": "PDF rasterization with Poppler; no AI regeneration, sharpening, text replacement or watermark removal. Raster source detail remains limited to embedded images.",
        "sheetCount": len(records), "sheets": records}
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    tiles = []
    contact = Image.new("RGB", (6 * 220, 5 * 310), "#e5e7eb")
    draw = ImageDraw.Draw(contact)
    for i, record in enumerate(records):
        stem = record["id"]
        with Image.open(thumbs / f"{stem}.jpg") as im:
            im.thumbnail((210, 275))
            x, y = (i % 6) * 220 + 5, (i // 6) * 310 + 5
            contact.paste(im, (x, y))
            draw.text((x, y + 280), stem, fill="black")
        tiles.append(f'<article><a href="{html.escape(record["png"])}"><img src="previews/{stem}.jpg" alt="{stem}" loading="lazy"></a><h2>{stem}</h2><a href="{record["png"]}" download>PNG {record["width"]} × {record["height"]}</a> · <a href="{record["pdf"]}" download>PDF gốc</a></article>')
    contact.save(root / "contact-sheet.jpg", quality=92)
    (root / "index.html").write_text('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Here to Slay — PnP</title><style>body{font:16px system-ui;margin:32px;background:#10161b;color:#edf2f7}a{color:#8dd6ff}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:24px}article{background:#202b35;padding:16px;border-radius:12px}img{width:100%;height:300px;object-fit:contain}h2{font-size:18px}</style><h1>Here to Slay — PnP</h1><p>27 tờ: 19 Base + 8 Kickstarter. PNG '+str(args.dpi)+' DPI xuất từ PDF gốc. Giữ nguyên chữ, artwork và watermark. Ảnh nhúng giới hạn chi tiết thực; không tái tạo bằng AI.</p><p>Rights: UNVERIFIED. Bộ nguồn riêng, chưa ánh xạ vào game.</p><main>'+"".join(tiles)+'</main></html>', encoding="utf-8")
    print(f"COMPLETE: {len(records)} PDFs + {len(records)} verified PNG sheets", flush=True)


if __name__ == "__main__":
    main()
