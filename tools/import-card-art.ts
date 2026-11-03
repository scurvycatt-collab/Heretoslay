#!/usr/bin/env node
/**
 * import-card-art — batch-import card artwork into the web app.
 *
 *   npm run import-art -- <input-dir> [options]
 *
 * Pipeline:
 *   1. Scan <input-dir> (recursive) for raster images.
 *   2. Match each file name to a `definitionId` in apps/worker/src/content/base-cards.json.
 *      Accepted names (case-insensitive, extension ignored):
 *        hts.base.v1.hero.bad-axe   (full definitionId)
 *        hero.bad-axe               (kind segment + slug)
 *        bad-axe                    (slug)
 *        Bad Axe / bad_axe          (card name, slugified)
 *   3. Crop/resize to the card kind's art box from docs/contracts/CARD_TEMPLATE_SPEC.json.
 *   4. Write apps/web/public/assets/cards/<definitionId>.<webp|png>.
 *   5. Merge results into apps/web/public/assets/cards/card-art-manifest.json
 *      (base-cards.json is only READ, never modified — it is engine data).
 *   6. Print a report: imported / skipped / cards still missing art.
 *
 * Artwork rights are UNVERIFIED (ADR-003). Output images are git-ignored by default.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardKind =
  | "party_leader" | "monster" | "hero" | "item" | "cursed_item" | "magic" | "modifier" | "challenge";

export type CardDef = { definitionId: string; name: string; kind: CardKind };

export type ArtBox = { x: number; y: number; w: number; h: number };

export type MatchMethod = "definitionId" | "kindSlug" | "slug" | "name";

export type CardIndex = {
  byKey: Map<string, { definitionId: string; method: MatchMethod }>;
  ambiguous: Map<string, string[]>;
  cards: Map<string, CardDef>;
};

export type MatchResult =
  | { ok: true; definitionId: string; method: MatchMethod }
  | { ok: false; reason: "unmatched" | "ambiguous"; candidates: string[] };

export type ManifestEntry = {
  artUrl: string;
  file: string;
  kind: CardKind;
  layout: string;
  width: number;
  height: number;
  format: OutputFormat;
  sha256: string;
  sourceFile: string;
  importedAt: string;
};

export type Manifest = {
  schema: 1;
  setId: string;
  rightsStatus: "UNVERIFIED";
  generatedAt: string;
  cards: Record<string, ManifestEntry>;
};

type OutputFormat = "webp" | "png";
type Fit = "cover" | "contain";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CARDS = path.join(REPO_ROOT, "apps/worker/src/content/base-cards.json");
const DEFAULT_SPEC = path.join(REPO_ROOT, "docs/contracts/CARD_TEMPLATE_SPEC.json");
const DEFAULT_OUT = path.join(REPO_ROOT, "apps/web/public/assets/cards");
const MANIFEST_NAME = "card-art-manifest.json";
const PUBLIC_URL_PREFIX = "/assets/cards";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".tif", ".tiff", ".gif"]);
const MATCH_PRIORITY: Record<MatchMethod, number> = { definitionId: 0, kindSlug: 1, slug: 2, name: 3 };

/** Card kinds without a layout of their own reuse another kind's art box. */
const LAYOUT_ALIAS: Partial<Record<CardKind, string>> = { cursed_item: "item" };

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** "Bad Axe", "bad_axe", "BAD-AXE " -> "bad-axe". Dots are kept (definitionId separators). */
export function normalizeKey(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-*\.-*/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** File stem without extension, normalised. */
export function fileKey(fileName: string): string {
  return normalizeKey(path.basename(fileName, path.extname(fileName)));
}

export function buildCardIndex(cards: CardDef[]): CardIndex {
  const byKey = new Map<string, { definitionId: string; method: MatchMethod }>();
  const owners = new Map<string, Set<string>>();
  const index: CardIndex = { byKey, ambiguous: new Map(), cards: new Map() };

  const add = (key: string, definitionId: string, method: MatchMethod) => {
    if (!key) return;
    const set = owners.get(key) ?? new Set<string>();
    set.add(definitionId);
    owners.set(key, set);
    const prev = byKey.get(key);
    if (!prev || MATCH_PRIORITY[method] < MATCH_PRIORITY[prev.method]) byKey.set(key, { definitionId, method });
  };

  for (const card of cards) {
    index.cards.set(card.definitionId, card);
    const id = normalizeKey(card.definitionId);
    const parts = id.split(".");
    const slug = parts.at(-1) ?? "";
    const kindSeg = parts.at(-2) ?? "";
    add(id, card.definitionId, "definitionId");
    add(`${kindSeg}.${slug}`, card.definitionId, "kindSlug");
    add(slug, card.definitionId, "slug");
    add(normalizeKey(card.name), card.definitionId, "name");
  }
  for (const [key, ids] of owners) {
    if (ids.size > 1) {
      index.ambiguous.set(key, [...ids].sort());
      byKey.delete(key);
    }
  }
  return index;
}

export function matchFile(fileName: string, index: CardIndex): MatchResult {
  const key = fileKey(fileName);
  const hit = index.byKey.get(key);
  if (hit) return { ok: true, ...hit };
  const amb = index.ambiguous.get(key);
  if (amb) return { ok: false, reason: "ambiguous", candidates: amb };
  return { ok: false, reason: "unmatched", candidates: suggest(key, index) };
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Closest slugs for a typo'd file name ("did you mean …"). */
function suggest(key: string, index: CardIndex): string[] {
  const slug = key.split(".").at(-1) ?? key;
  const scored: Array<[number, string]> = [];
  for (const card of index.cards.values()) {
    const cardSlug = card.definitionId.split(".").at(-1)!;
    const d = levenshtein(slug, cardSlug);
    if (d <= Math.max(2, Math.floor(cardSlug.length / 4))) scored.push([d, card.definitionId]);
  }
  return scored.sort((x, y) => x[0] - y[0] || x[1].localeCompare(y[1])).slice(0, 3).map(([, id]) => id);
}

export function layoutKeyFor(kind: CardKind): string {
  return LAYOUT_ALIAS[kind] ?? kind;
}

export function artBoxesFromSpec(spec: unknown): Map<string, ArtBox> {
  const layouts = (spec as { layouts?: Record<string, { art?: Partial<ArtBox> }> })?.layouts;
  if (!layouts || typeof layouts !== "object") throw new Error("CARD_TEMPLATE_SPEC.json: missing `layouts`");
  const boxes = new Map<string, ArtBox>();
  for (const [key, layout] of Object.entries(layouts)) {
    const art = layout?.art;
    if (!art) continue;
    const { x, y, w, h } = art;
    if (![x, y, w, h].every((n) => Number.isFinite(n)) || w! <= 0 || h! <= 0) {
      throw new Error(`CARD_TEMPLATE_SPEC.json: layouts.${key}.art is invalid (${JSON.stringify(art)})`);
    }
    boxes.set(key, { x: x!, y: y!, w: w!, h: h! });
  }
  return boxes;
}

export function parseCards(raw: unknown): { setId: string; cards: CardDef[] } {
  const data = raw as { setId?: unknown; cards?: unknown };
  if (!data || !Array.isArray(data.cards)) throw new Error("cards JSON: missing `cards` array");
  const cards: CardDef[] = [];
  for (const [i, c] of (data.cards as Array<Record<string, unknown>>).entries()) {
    if (typeof c?.definitionId !== "string" || typeof c?.kind !== "string" || typeof c?.name !== "string") {
      throw new Error(`cards JSON: cards[${i}] lacks definitionId/kind/name`);
    }
    cards.push({ definitionId: c.definitionId, name: c.name, kind: c.kind as CardKind });
  }
  return { setId: typeof data.setId === "string" ? data.setId : "unknown", cards };
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

async function readJson(file: string, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    throw new Error(`${label} not found or unreadable: ${file} (${(err as Error).message})`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${file} (${(err as Error).message})`);
  }
}

/** Recursively list files, skipping dot-files/dirs and the output dir itself. */
async function listFiles(dir: string, exclude: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (path.resolve(full) === path.resolve(exclude)) continue;
    if (entry.isDirectory()) out.push(...(await listFiles(full, exclude)));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

async function writeAtomic(file: string, data: Buffer | string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `Usage: npm run import-art -- <input-dir> [options]

Options:
  --format <webp|png>     Output format (default: webp)
  --quality <1-100>       WebP quality (default: 86)
  --fit <cover|contain>   cover = crop to fill the art box (default); contain = letterbox, transparent padding
  --position <pos>        Crop anchor for cover: centre|top|bottom|left|right|attention|entropy (default: centre)
  --scale <n>             Multiply art-box pixel size, e.g. 0.5 for lighter assets (default: 1)
  --out <dir>             Output dir (default: apps/web/public/assets/cards)
  --cards <file>          Card data JSON (default: apps/worker/src/content/base-cards.json)
  --spec <file>           Template spec (default: docs/contracts/CARD_TEMPLATE_SPEC.json)
  --reset                 Drop existing manifest entries instead of merging
  --dry-run               Match and validate only; write nothing
  --strict                Exit 1 if any file was skipped or failed
  --verbose               List every missing card id
  -h, --help              Show this help`;

type Options = {
  input: string; out: string; cards: string; spec: string;
  format: OutputFormat; quality: number; fit: Fit; position: string; scale: number;
  reset: boolean; dryRun: boolean; strict: boolean; verbose: boolean;
};

const POSITIONS = new Set(["centre", "center", "top", "bottom", "left", "right", "attention", "entropy"]);

function parseOptions(argv: string[]): Options | null {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: "string", default: "webp" },
      quality: { type: "string", default: "86" },
      fit: { type: "string", default: "cover" },
      position: { type: "string", default: "centre" },
      scale: { type: "string", default: "1" },
      out: { type: "string", default: DEFAULT_OUT },
      cards: { type: "string", default: DEFAULT_CARDS },
      spec: { type: "string", default: DEFAULT_SPEC },
      reset: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) return null;
  if (positionals.length !== 1) throw new Error("expected exactly one <input-dir>");
  const format = values.format as OutputFormat;
  if (format !== "webp" && format !== "png") throw new Error(`--format must be webp|png, got "${values.format}"`);
  const fit = values.fit as Fit;
  if (fit !== "cover" && fit !== "contain") throw new Error(`--fit must be cover|contain, got "${values.fit}"`);
  if (!POSITIONS.has(values.position!)) throw new Error(`--position invalid: "${values.position}"`);
  const quality = Number(values.quality);
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("--quality must be an integer 1-100");
  const scale = Number(values.scale);
  if (!(scale > 0 && scale <= 4)) throw new Error("--scale must be in (0, 4]");
  return {
    input: path.resolve(positionals[0]),
    out: path.resolve(values.out!),
    cards: path.resolve(values.cards!),
    spec: path.resolve(values.spec!),
    format, quality, fit, scale,
    position: values.position === "center" ? "centre" : values.position!,
    reset: values.reset!, dryRun: values["dry-run"]!, strict: values.strict!, verbose: values.verbose!,
  };
}

type Skip = { file: string; reason: string };

export async function run(argv: string[]): Promise<number> {
  const opts = parseOptions(argv);
  if (!opts) {
    console.log(HELP);
    return 0;
  }

  const inputStat = await stat(opts.input).catch(() => null);
  if (!inputStat?.isDirectory()) throw new Error(`input is not a directory: ${opts.input}`);

  const { setId, cards } = parseCards(await readJson(opts.cards, "cards JSON"));
  const boxes = artBoxesFromSpec(await readJson(opts.spec, "CARD_TEMPLATE_SPEC.json"));
  const index = buildCardIndex(cards);

  // Fail fast if a card kind has no art box — that is a spec/data mismatch, not a per-file problem.
  const kindsWithoutBox = [...new Set(cards.map((c) => c.kind))].filter((k) => !boxes.has(layoutKeyFor(k)));
  if (kindsWithoutBox.length) throw new Error(`no art box in spec for kind(s): ${kindsWithoutBox.join(", ")}`);

  // Lazy import so `--help` and argument errors work even if sharp is missing.
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    throw new Error("`sharp` is not installed. Run: npm install (sharp is a root devDependency)");
  }

  const files = await listFiles(opts.input, opts.out);
  const ignored: Skip[] = [];
  const skipped: Skip[] = [];
  const failed: Skip[] = [];
  const rel = (f: string) => path.relative(opts.input, f) || path.basename(f);

  // 1. Match names -> definitionIds; resolve duplicates by match quality then file name.
  const chosen = new Map<string, { file: string; method: MatchMethod }>();
  for (const file of files) {
    if (!IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      ignored.push({ file: rel(file), reason: "not an image extension" });
      continue;
    }
    const m = matchFile(file, index);
    if (!m.ok) {
      const hint = m.candidates.length ? ` — ${m.reason === "ambiguous" ? "matches" : "did you mean"}: ${m.candidates.join(", ")}` : "";
      skipped.push({ file: rel(file), reason: `${m.reason} id "${fileKey(file)}"${hint}` });
      continue;
    }
    const prev = chosen.get(m.definitionId);
    if (prev && MATCH_PRIORITY[prev.method] <= MATCH_PRIORITY[m.method]) {
      skipped.push({ file: rel(file), reason: `duplicate for ${m.definitionId} (kept ${rel(prev.file)})` });
      continue;
    }
    if (prev) skipped.push({ file: rel(prev.file), reason: `duplicate for ${m.definitionId} (kept ${rel(file)})` });
    chosen.set(m.definitionId, { file, method: m.method });
  }

  // 2. Load existing manifest (merge mode).
  const manifestPath = path.join(opts.out, MANIFEST_NAME);
  let previous: Record<string, ManifestEntry> = {};
  if (!opts.reset && existsSync(manifestPath)) {
    try {
      previous = ((await readJson(manifestPath, "manifest")) as Manifest).cards ?? {};
    } catch (err) {
      console.warn(`! existing manifest unreadable, starting fresh: ${(err as Error).message}`);
    }
  }

  // 3. Process images.
  if (!opts.dryRun) await mkdir(opts.out, { recursive: true });
  const imported = new Map<string, ManifestEntry>();
  const now = new Date().toISOString();

  await pool([...chosen.entries()], 4, async ([definitionId, { file }]) => {
    const card = index.cards.get(definitionId)!;
    const layout = layoutKeyFor(card.kind);
    const box = boxes.get(layout)!;
    const width = Math.round(box.w * opts.scale);
    const height = Math.round(box.h * opts.scale);
    try {
      const img = sharp(file, { failOn: "error", animated: false });
      const meta = await img.metadata();
      if (!meta.width || !meta.height) throw new Error("could not read image dimensions");
      if (opts.dryRun) {
        imported.set(definitionId, placeholderEntry(definitionId, card, layout, width, height, opts.format, rel(file), now));
        return;
      }
      let pipeline = img
        .rotate() // honour EXIF orientation
        .resize(width, height, {
          fit: opts.fit,
          position: opts.position,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          withoutEnlargement: false,
        });
      pipeline = opts.format === "webp"
        ? pipeline.webp({ quality: opts.quality, effort: 5 })
        : pipeline.png({ compressionLevel: 9, palette: false });
      const buf = await pipeline.toBuffer();
      const outName = `${definitionId}.${opts.format}`;
      await writeAtomic(path.join(opts.out, outName), buf);
      // Drop a stale sibling in the other format so the folder has one file per card.
      const other = path.join(opts.out, `${definitionId}.${opts.format === "webp" ? "png" : "webp"}`);
      await rm(other, { force: true });
      const sha256 = createHash("sha256").update(buf).digest("hex");
      imported.set(definitionId, {
        artUrl: `${PUBLIC_URL_PREFIX}/${outName}?v=${sha256.slice(0, 10)}`,
        file: outName,
        kind: card.kind,
        layout,
        width,
        height,
        format: opts.format,
        sha256,
        sourceFile: path.basename(file),
        importedAt: now,
      });
    } catch (err) {
      failed.push({ file: rel(file), reason: `invalid/unreadable image: ${(err as Error).message}` });
    }
  });

  // 4. Merge + prune manifest (drop ids no longer in card data, or whose file vanished).
  const merged: Record<string, ManifestEntry> = {};
  for (const [id, entry] of Object.entries(previous)) {
    if (!index.cards.has(id) || !entry?.file) continue;
    if (!existsSync(path.join(opts.out, entry.file))) continue;
    merged[id] = entry;
  }
  for (const [id, entry] of imported) merged[id] = entry;
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  const manifest: Manifest = { schema: 1, setId, rightsStatus: "UNVERIFIED", generatedAt: now, cards: sorted };
  if (!opts.dryRun) await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // 5. Report.
  const missing = cards.filter((c) => !sorted[c.definitionId]);
  printReport({ opts, files: files.length, imported, skipped, failed, ignored, cards, missing, manifestPath });

  const problems = skipped.length + failed.length;
  return opts.strict && (problems > 0 || missing.length > 0) ? 1 : failed.length > 0 ? 2 : 0;
}

function placeholderEntry(
  definitionId: string, card: CardDef, layout: string, width: number, height: number,
  format: OutputFormat, sourceFile: string, now: string,
): ManifestEntry {
  const file = `${definitionId}.${format}`;
  return { artUrl: `${PUBLIC_URL_PREFIX}/${file}`, file, kind: card.kind, layout, width, height, format, sha256: "", sourceFile, importedAt: now };
}

function shown(p: string): string {
  const r = path.relative(REPO_ROOT, p);
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? r : p;
}

function printReport(r: {
  opts: Options; files: number; imported: Map<string, ManifestEntry>;
  skipped: Skip[]; failed: Skip[]; ignored: Skip[]; cards: CardDef[]; missing: CardDef[]; manifestPath: string;
}): void {
  const line = "─".repeat(64);
  console.log(`\n${line}\n Card art import ${r.opts.dryRun ? "(DRY RUN — nothing written)" : ""}\n${line}`);
  console.log(` input     ${r.opts.input}  (${r.files} files)`);
  console.log(` output    ${shown(r.opts.out)}  [${r.opts.format}, fit=${r.opts.fit}, scale=${r.opts.scale}]`);

  const byKind = new Map<string, number>();
  for (const e of r.imported.values()) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  const kindSummary = [...byKind].map(([k, n]) => `${k} ${n}`).join(", ");
  console.log(`\n ✔ imported           ${r.imported.size}${kindSummary ? `  (${kindSummary})` : ""}`);
  console.log(` ✖ skipped (no/dup id) ${r.skipped.length}`);
  for (const s of r.skipped) console.log(`     - ${s.file}: ${s.reason}`);
  console.log(` ✖ failed (bad image)  ${r.failed.length}`);
  for (const s of r.failed) console.log(`     - ${s.file}: ${s.reason}`);
  console.log(` · ignored (non-image) ${r.ignored.length}`);
  if (r.opts.verbose) for (const s of r.ignored) console.log(`     - ${s.file}`);

  const have = r.cards.length - r.missing.length;
  console.log(`\n Coverage  ${have}/${r.cards.length} cards have art · ${r.missing.length} still missing`);
  const missingByKind = new Map<string, CardDef[]>();
  for (const c of r.missing) missingByKind.set(c.kind, [...(missingByKind.get(c.kind) ?? []), c]);
  for (const [kind, list] of [...missingByKind].sort()) {
    console.log(`   ${kind.padEnd(13)} ${String(list.length).padStart(3)} missing`);
    if (r.opts.verbose) for (const c of list) console.log(`     - ${c.definitionId}`);
  }
  if (!r.opts.verbose && r.missing.length) console.log("   (use --verbose to list missing ids)");
  if (!r.opts.dryRun) console.log(`\n manifest  ${shown(r.manifestPath)}`);
  console.log(` rights    UNVERIFIED (ADR-003) — output is git-ignored; do not commit/deploy without owner sign-off\n${line}\n`);
}

// Entry point (skipped when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err: unknown) => {
      console.error(`import-art: ${(err as Error).message ?? err}\n\nRun with --help for usage.`);
      process.exitCode = 1;
    },
  );
}
