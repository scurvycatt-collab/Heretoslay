"""Export browser-acquired Monster Expansion PNG originals to 600-DPI letter canvases.

No AI processing. The generated PDF is explicitly not an original website PDF.
Requires bundled Pillow, reportlab and pypdf. Never changes downloaded originals.
"""
import hashlib
import html
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/cards/wiki-monster-expansion-20261103"
DOWNLOADS = Path.home() / "Downloads"
PAGE = "https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Monster_Expansion_-_Cards_In_This_Deck"
CARDS = [
    ("Ancient Megashark", 205, "7/76"),
    ("Clawed Nightmare", 211, "6/68"),
    ("Dragon Wasp", 206, "2/2b"),
    ("Goretelodont", 201, "f/fd"),
    ("Lumbering Demon", 203, "9/93"),
    ("Possessed Plush", 212, "4/42"),
    ("Reef Ripper", 204, "e/ee"),
    ("Saffyre Phoenix", 213, "d/dc"),
    ("Scavenger Griffin", 207, "6/69"),
    ("Venomous Gemini", 209, "9/98"),
    ("Voltclaw Lion", 202, "0/0d"),
    ("Wandering Behemoth", 208, "0/09"),
    ("Wicked Sea Serpent", 210, "3/34"),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    for sub in ["source-png", "png-600dpi", "previews"]:
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    pdf_path = OUT / "monster-expansion-generated-from-png.pdf"
    pdf = canvas.Canvas(str(pdf_path), pagesize=(612, 792))
    pdf.setTitle("Monster Expansion — generated from wiki PNG originals")
    pdf.setSubject("Generated PDF, not a downloaded original PDF. Source: " + PAGE)
    records = []
    contact = Image.new("RGB", (5 * 240, 3 * 440), "#e5e7eb")
    draw = ImageDraw.Draw(contact)
    tiles = []
    for i, (name, number, folder) in enumerate(CARDS):
        filename = f"HtS-Mon-{number}-2E.png"
        source = DOWNLOADS / filename
        original = OUT / "source-png" / filename
        if original.exists() and sha(original) != sha(source):
            raise ValueError(f"Source changed, refusing overwrite: {original}")
        if not original.exists():
            shutil.copy2(source, original)
        slug = name.lower().replace(" ", "-")
        dest = OUT / "png-600dpi" / f"{slug}.png"
        with Image.open(original) as im:
            im.load()
            native_size = list(im.size)
            rgba = im.convert("RGBA")
            rgb = Image.new("RGB", im.size, "white")
            rgb.paste(rgba, mask=rgba.getchannel("A"))
        factor = min(5100 / rgb.width, 6600 / rgb.height)
        fit_size = (round(rgb.width * factor), round(rgb.height * factor))
        x, y = (5100 - fit_size[0]) // 2, (6600 - fit_size[1]) // 2
        sheet = Image.new("RGB", (5100, 6600), "white")
        sheet.paste(rgb.resize(fit_size, Image.Resampling.LANCZOS), (x, y))
        sheet.save(dest, dpi=(600, 600), compress_level=3)
        with Image.open(dest) as check:
            check.load()
            assert check.size == (5100, 6600)
            assert all(abs(d - 600) < 0.1 for d in check.info["dpi"])
        # Embed the original raster; PDF geometry matches the exported PNG canvas.
        pdf.drawImage(ImageReader(rgb), x * 72 / 600, (6600 - y - fit_size[1]) * 72 / 600,
                      width=fit_size[0] * 72 / 600, height=fit_size[1] * 72 / 600)
        pdf.showPage()
        sheet.thumbnail((220, 380))
        preview = OUT / "previews" / f"{slug}.jpg"
        sheet.save(preview, quality=92)
        cx, cy = (i % 5) * 240 + 10, (i // 5) * 440 + 10
        contact.paste(sheet, (cx, cy))
        draw.text((cx, cy + 390), name, fill="black")
        records.append({"name": name, "previewId": f"monster-2e-{number}", "definitionId": None,
            "edition": "2nd Edition (2023 Kickstarter, as currently displayed by wiki)",
            "cardPage": "https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_-_" + name.replace(" ", "_"),
            "filePage": "https://www.unstablegameswiki.com/index.php?title=File:" + filename,
            "sourceUrl": f"https://www.unstablegameswiki.com/images/{folder}/{filename}",
            "original": original.relative_to(OUT).as_posix(), "sourceSha256": sha(original),
            "sourceWidth": native_size[0], "sourceHeight": native_size[1],
            "png": dest.relative_to(OUT).as_posix(), "sha256": sha(dest),
            "width": 5100, "height": 6600, "dpi": 600,
            "contentRect": {"x": x, "y": y, "width": fit_size[0], "height": fit_size[1]},
            "fit": "contain, white letter canvas, preserve aspect ratio", "pdfLinksOnCardPage": [],
            "rightsStatus": "UNVERIFIED"})
        tiles.append(f'<article><a href="png-600dpi/{slug}.png"><img src="previews/{slug}.jpg" alt="{html.escape(name)}" loading="lazy"></a><h2>{html.escape(name)}</h2><a href="png-600dpi/{slug}.png" download>PNG 5100 × 6600</a> · <a href="source-png/{filename}" download>PNG gốc</a></article>')
        print(f"PASS {name}: {native_size} -> 5100x6600, 600 DPI", flush=True)
    pdf.save()
    reader = PdfReader(pdf_path)
    assert len(reader.pages) == 13
    assert all(tuple(float(v) for v in p.mediabox[2:]) == (612.0, 792.0) for p in reader.pages)
    manifest = {"schema": 1, "acquiredOn": "2026-11-03", "sourcePage": PAGE,
        "cardCount": 13, "rightsStatus": "UNVERIFIED", "gameplaySupported": False,
        "processing": "Lanczos resize into white 5100x6600 letter canvases with 600-DPI PNG metadata. No AI restoration, sharpening, content, text or watermark edits.",
        "sourcePdfStatus": "No PDF links found on the deck page or its 13 card pages. Original source files are PNGs.",
        "generatedPdf": {"path": pdf_path.name, "isOriginal": False, "pages": 13, "sha256": sha(pdf_path)},
        "cards": records}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    contact.save(OUT / "contact-sheet.jpg", quality=92)
    (OUT / "index.html").write_text('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Monster Expansion — 13 PNG</title><style>body{font:16px system-ui;margin:32px;background:#10161b;color:#edf2f7}a{color:#8dd6ff}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:24px}article{background:#202b35;padding:16px;border-radius:12px}img{width:100%;height:340px;object-fit:contain}h2{font-size:18px}</style><h1>Monster Expansion — 13 lá, 2nd Edition</h1><p>PNG 5100 × 6600 px, 600 DPI. Giữ tỷ lệ thẻ, thêm lề trắng; không xử lý AI.</p><p>Nguồn wiki cung cấp PNG gốc, không thấy PDF gốc. <a href="monster-expansion-generated-from-png.pdf">PDF 13 trang tạo từ PNG nguồn</a> — không phải PDF gốc của website.</p><p>Rights UNVERIFIED. Chưa tích hợp gameplay.</p><main>'+"".join(tiles)+'</main></html>', encoding="utf-8")
    print("COMPLETE: 13 originals, 13 verified PNGs, generated 13-page PDF", flush=True)


if __name__ == "__main__":
    main()
