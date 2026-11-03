#!/usr/bin/env node
/**
 * import-card-art — headless batch import of card ARTWORK (illustration only).
 *
 *   npm run import-art -- <input-dir> [options]
 *
 * Pipeline:
 *   1. Scan <input-dir> (recursive) for PNG/JPEG/WebP files; enforce size/pixel limits.
 *   2. Map each file name to a `definitionId` in apps/worker/src/content/base-cards.json:
 *        hts.base.v1.hero.bad-axe   full definitionId     -> mappingStatus "confirmed"
 *        hero.bad-axe / bad-axe / Bad Axe (kind.slug, slug, name) -> "proposed" (needs review)
 *   3. Decode for real (EXIF upright), reject anything that is not PNG/JPEG/WebP by content.
 *   4. Crop (cover, explicit rect) or contain into the kind's art box from
 *      docs/contracts/CARD_TEMPLATE_SPEC.json; write <definitionId>.<png|webp>.
 *   5. Write card-art-manifest.json (schema 2) into a NEW batch dir by default
 *      (assets/imports/card-art-<stamp>/, git-ignored, not under web public/).
 *   6. Print a report: imported / proposed / skipped / failed / cards still missing.
 *
 * Scope: this is the "artwork" input type of docs/contracts/ASSET_IMPORT_WORKBENCH.md.
 * Output is NOT a complete card face (renderMode "artwork"); compositing into a
 * 745×1040 / 827×1417 face is the renderer/workbench's job.
 * base-cards.json is only READ. Artwork rights are UNVERIFIED (ADR-003).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  containRect as coreContain, coverCrop as coreCover, normalizeKey,
} from "../apps/web/src/asset-import/adapters/core.ts";

export { normalizeKey };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardKind =
  | "party_leader" | "monster" | "hero" | "item" | "cursed_item" | "magic" | "modifier" | "challenge";

export type CardDef = { definitionId: string; name: string; kind: CardKind };

export type Rect = { x: number; y: number; w: number; h: number };
export type ArtBox = Rect;

export type MatchMethod = "definitionId" | "kindSlug" | "slug" | "name";
export type MappingStatus = "confirmed" | "proposed";

export type CardIndex = {
  byKey: Map<string, { definitionId: string; method: MatchMethod }>;
  ambiguous: Map<string, string[]>;
  cards: Map<string, CardDef>;
};

export type MatchResult =
  | { ok: true; definitionId: string; method: MatchMethod }
  | { ok: false; reason: "unmatched" | "ambiguous"; candidates: string[] };

export type OutputFormat = "png" | "webp";
export type Fit = "cover" | "contain";
export type Position = "centre" | "top" | "bottom" | "left" | "right";

export type ManifestEntry = {
  definitionId: string;
  mappingStatus: MappingStatus;
  matchMethod: MatchMethod;
  inputType: "artwork";
  renderMode: "artwork";
  kind: CardKind;
  layout: string;
  relativePath: string;
  artUrl: string | null;
  width: number;
  height: number;
  format: OutputFormat;
  sha256: string;
  bytes: number;
  source: { relativePath: string; sha256: string; width: number; height: number; bytes: number };
  /** Integer px in the upright (EXIF-applied) source, before rotation (always 0 here). */
  crop: Rect;
  rotation: 0;
  fit: Fit;
  /** Where the source pixels landed inside the output canvas (smaller than canvas for contain). */
  contentRect: Rect;
  importedAt: string;
};

export type Manifest = {
  schema: 2;
  packType: "artwork";
  setId: string;
  rightsStatus: "UNVERIFIED";
  gameplaySupported: false;
  generatedAt: string;
  cards: Record<string, ManifestEntry>;
};

export type Limits = { maxFileBytes: number; maxBatchBytes: number; maxPixels: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CARDS = path.join(REPO_ROOT, "apps/worker/src/content/base-cards.json");
const DEFAULT_SPEC = path.join(REPO_ROOT, "docs/contracts/CARD_TEMPLATE_SPEC.json");
const DEFAULT_BATCH_ROOT = path.join(REPO_ROOT, "assets/imports");
const WEB_PUBLIC = path.join(REPO_ROOT, "apps/web/public");
export const MANIFEST_NAME = "card-art-manifest.json";

/** v1 limits from ASSET_IMPORT_WORKBENCH.md — reported as errors, never silently downscaled. */
export const DEFAULT_LIMITS: Limits = { maxFileBytes: 32 * 2 ** 20, maxBatchBytes: 256 * 2 ** 20, maxPixels: 40_000_000 };

/** Extension is only a hint for scanning; the decoded format is what counts. */
export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DECODED_FORMATS = new Set(["png", "jpeg", "webp"]);
const SAFE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const MATCH_PRIORITY: Record<MatchMethod, number> = { definitionId: 0, kindSlug: 1, slug: 2, name: 3 };

/** Card kinds without a layout of their own reuse another kind's art box. */
const LAYOUT_ALIAS: Partial<Record<CardKind, string>> = { cursed_item: "item" };

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

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

/** Only an exact definitionId in the file name counts as an owner-confirmed mapping. */
export function mappingStatusFor(method: MatchMethod): MappingStatus {
  return method === "definitionId" ? "confirmed" : "proposed";
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
    if (![x, y, w, h].every((n) => Number.isInteger(n)) || w! <= 0 || h! <= 0) {
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
    if (!SAFE_ID.test(c.definitionId)) throw new Error(`cards JSON: unsafe definitionId for a file name: ${c.definitionId}`);
    cards.push({ definitionId: c.definitionId, name: c.name, kind: c.kind as CardKind });
  }
  return { setId: typeof data.setId === "string" ? data.setId : "unknown", cards };
}

/** Shared geometry (adapters/core.ts), mapped to this manifest's {x,y,w,h} shape. */
export function coverCrop(srcW: number, srcH: number, w: number, h: number, position: Position): Rect {
  const b = coreCover(srcW, srcH, w, h, position);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

export function containRect(srcW: number, srcH: number, w: number, h: number): Rect {
  const b = coreContain(srcW, srcH, w, h);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
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

/** Recursively list files, skipping dot-files/dirs, symlinks and the output dir itself. */
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

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
const posix = (p: string) => p.split(path.sep).join("/");
const mib = (bytes: number) => `${(bytes / 2 ** 20).toFixed(1)} MiB`;

function isInside(child: string, parent: string): boolean {
  const r = path.relative(parent, child);
  return !!r && !r.startsWith("..") && !path.isAbsolute(r);
}

function batchStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `Usage: npm run import-art -- <input-dir> [options]

Imports ARTWORK only (illustration cropped to the template art box). Complete card
fronts / sheets belong to the asset-import workbench (ASSET_IMPORT_WORKBENCH.md).

Options:
  --out <dir>             Output dir. Default: NEW batch dir assets/imports/card-art-<stamp>/.
                          An existing dir with a schema-2 manifest is merged (use --reset to replace).
  --format <png|webp>     Output format (default: png)
  --quality <1-100>       WebP quality (default: 86)
  --fit <cover|contain>   cover = crop to fill the art box (default); contain = whole image, transparent padding
  --position <pos>        Crop anchor for cover: centre|top|bottom|left|right (default: centre)
  --scale <n>             Multiply art-box pixel size, e.g. 0.5 (default: 1)
  --exact-only            Skip "proposed" matches; import only files named with the full definitionId
  --max-file-mib <n>      Per-file limit (default: 32)
  --max-batch-mib <n>     Per-batch limit over matched files (default: 256)
  --max-megapixels <n>    Per-image decoded pixel limit (default: 40)
  --cards <file>          Card data JSON (default: apps/worker/src/content/base-cards.json)
  --spec <file>           Template spec (default: docs/contracts/CARD_TEMPLATE_SPEC.json)
  --reset                 Drop existing manifest entries in --out instead of merging
  --dry-run               Match, decode and validate only; write nothing
  --strict                Exit 1 if anything was skipped/failed/proposed or cards are missing
  --verbose               List ignored files and every missing card id
  -h, --help              Show this help

Exit codes: 0 ok · 1 config/batch error or --strict not met · 2 at least one image failed`;

type Options = {
  input: string; out: string; outIsDefault: boolean; cards: string; spec: string;
  format: OutputFormat; quality: number; fit: Fit; position: Position; scale: number;
  exactOnly: boolean; limits: Limits;
  reset: boolean; dryRun: boolean; strict: boolean; verbose: boolean;
};

const POSITIONS = new Set(["centre", "center", "top", "bottom", "left", "right"]);

function positiveNumber(raw: string | undefined, flag: string, max = Infinity): number {
  const n = Number(raw);
  if (!(n > 0 && n <= max)) throw new Error(`${flag} must be a number in (0, ${max}]`);
  return n;
}

function parseOptions(argv: string[], now: Date): Options | null {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      format: { type: "string", default: "png" },
      quality: { type: "string", default: "86" },
      fit: { type: "string", default: "cover" },
      position: { type: "string", default: "centre" },
      scale: { type: "string", default: "1" },
      "exact-only": { type: "boolean", default: false },
      "max-file-mib": { type: "string", default: "32" },
      "max-batch-mib": { type: "string", default: "256" },
      "max-megapixels": { type: "string", default: "40" },
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
  if (format !== "webp" && format !== "png") throw new Error(`--format must be png|webp, got "${values.format}"`);
  const fit = values.fit as Fit;
  if (fit !== "cover" && fit !== "contain") throw new Error(`--fit must be cover|contain, got "${values.fit}"`);
  if (!POSITIONS.has(values.position!)) throw new Error(`--position must be centre|top|bottom|left|right, got "${values.position}"`);
  const quality = Number(values.quality);
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("--quality must be an integer 1-100");
  const outIsDefault = values.out === undefined;
  return {
    input: path.resolve(positionals[0]),
    out: outIsDefault ? path.join(DEFAULT_BATCH_ROOT, `card-art-${batchStamp(now)}`) : path.resolve(values.out!),
    outIsDefault,
    cards: path.resolve(values.cards!),
    spec: path.resolve(values.spec!),
    format, quality, fit,
    position: (values.position === "center" ? "centre" : values.position) as Position,
    scale: positiveNumber(values.scale, "--scale", 4),
    exactOnly: values["exact-only"]!,
    limits: {
      maxFileBytes: positiveNumber(values["max-file-mib"], "--max-file-mib") * 2 ** 20,
      maxBatchBytes: positiveNumber(values["max-batch-mib"], "--max-batch-mib") * 2 ** 20,
      maxPixels: positiveNumber(values["max-megapixels"], "--max-megapixels") * 1e6,
    },
    reset: values.reset!, dryRun: values["dry-run"]!, strict: values.strict!, verbose: values.verbose!,
  };
}

type Skip = { file: string; reason: string };

export async function run(argv: string[]): Promise<number> {
  const now = new Date();
  const opts = parseOptions(argv, now);
  if (!opts) {
    console.log(HELP);
    return 0;
  }

  const inputStat = await stat(opts.input).catch(() => null);
  if (!inputStat?.isDirectory()) throw new Error(`input is not a directory: ${opts.input}`);
  if (path.resolve(opts.out) === path.resolve(opts.input) || isInside(opts.input, opts.out)) {
    throw new Error("--out must not be the input dir or contain it (sources are never overwritten)");
  }

  const { setId, cards } = parseCards(await readJson(opts.cards, "cards JSON"));
  const boxes = artBoxesFromSpec(await readJson(opts.spec, "CARD_TEMPLATE_SPEC.json"));
  const index = buildCardIndex(cards);

  // A card kind without an art box is a spec/data mismatch, not a per-file problem.
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
  const rel = (f: string) => posix(path.relative(opts.input, f) || path.basename(f));

  // 1. Map names -> definitionIds; duplicates resolved by match quality, then file order.
  type Pick = { file: string; method: MatchMethod; bytes: number };
  const chosen = new Map<string, Pick>();
  for (const file of files) {
    if (!IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      ignored.push({ file: rel(file), reason: "not a PNG/JPEG/WebP extension" });
      continue;
    }
    const bytes = (await stat(file)).size;
    if (bytes === 0) { failed.push({ file: rel(file), reason: "empty file" }); continue; }
    if (bytes > opts.limits.maxFileBytes) {
      failed.push({ file: rel(file), reason: `file is ${mib(bytes)} > limit ${mib(opts.limits.maxFileBytes)}` });
      continue;
    }
    const m = matchFile(file, index);
    if (!m.ok) {
      const hint = m.candidates.length ? ` — ${m.reason === "ambiguous" ? "matches" : "did you mean"}: ${m.candidates.join(", ")}` : "";
      skipped.push({ file: rel(file), reason: `${m.reason} id "${fileKey(file)}"${hint}` });
      continue;
    }
    if (opts.exactOnly && m.method !== "definitionId") {
      skipped.push({ file: rel(file), reason: `proposed ${m.definitionId} (--exact-only; rename to the full id to confirm)` });
      continue;
    }
    const prev = chosen.get(m.definitionId);
    if (prev && MATCH_PRIORITY[prev.method] <= MATCH_PRIORITY[m.method]) {
      skipped.push({ file: rel(file), reason: `duplicate for ${m.definitionId} (kept ${rel(prev.file)})` });
      continue;
    }
    if (prev) skipped.push({ file: rel(prev.file), reason: `duplicate for ${m.definitionId} (kept ${rel(file)})` });
    chosen.set(m.definitionId, { file, method: m.method, bytes });
  }

  const batchBytes = [...chosen.values()].reduce((sum, p) => sum + p.bytes, 0);
  if (batchBytes > opts.limits.maxBatchBytes) {
    throw new Error(`batch is ${mib(batchBytes)} > limit ${mib(opts.limits.maxBatchBytes)}; split the folder or raise --max-batch-mib`);
  }

  // 2. Existing manifest (only when the owner pointed --out at an existing dir).
  const manifestPath = path.join(opts.out, MANIFEST_NAME);
  let previous: Record<string, ManifestEntry> = {};
  if (!opts.reset && existsSync(manifestPath)) {
    try {
      const old = (await readJson(manifestPath, "manifest")) as Partial<Manifest>;
      if (old.schema === 2 && old.cards) previous = old.cards;
      else console.warn(`! existing manifest has schema ${String(old.schema)} (not 2); it will be replaced`);
    } catch (err) {
      console.warn(`! existing manifest unreadable, it will be replaced: ${(err as Error).message}`);
    }
  }

  // 3. Decode, validate, crop, encode.
  if (!opts.dryRun) await mkdir(opts.out, { recursive: true });
  const imported = new Map<string, ManifestEntry>();
  const importedAt = now.toISOString();
  const urlBase = isInside(opts.out, WEB_PUBLIC) ? `/${posix(path.relative(WEB_PUBLIC, opts.out))}` : null;

  await pool([...chosen.entries()], 2, async ([definitionId, pick]) => {
    const card = index.cards.get(definitionId)!;
    const layout = layoutKeyFor(card.kind);
    const box = boxes.get(layout)!;
    const width = Math.round(box.w * opts.scale);
    const height = Math.round(box.h * opts.scale);
    try {
      const input = await readFile(pick.file);
      const meta = await sharp(input, { failOn: "error", limitInputPixels: false }).metadata();
      if (!meta.format || !DECODED_FORMATS.has(meta.format)) {
        throw new Error(`decoded format "${meta.format ?? "unknown"}" is not PNG/JPEG/WebP`);
      }
      if ((meta.pages ?? 1) > 1) throw new Error("animated/multi-page images are not supported");
      if (!meta.width || !meta.height) throw new Error("could not read image dimensions");
      if (meta.width * meta.height > opts.limits.maxPixels) {
        throw new Error(`${meta.width}×${meta.height} exceeds ${opts.limits.maxPixels / 1e6} MP limit`);
      }

      // Upright (EXIF-applied) source: crop coordinates live in this space.
      const upright = await sharp(input, { failOn: "error" }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const srcW = upright.info.width;
      const srcH = upright.info.height;
      const raw = () => sharp(upright.data, { raw: { width: srcW, height: srcH, channels: upright.info.channels } });

      let crop: Rect;
      let contentRect: Rect;
      let pipeline;
      if (opts.fit === "cover") {
        crop = coverCrop(srcW, srcH, width, height, opts.position);
        contentRect = { x: 0, y: 0, w: width, h: height };
        pipeline = raw()
          .extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h })
          .resize(width, height, { fit: "fill" });
      } else {
        crop = { x: 0, y: 0, w: srcW, h: srcH };
        contentRect = containRect(srcW, srcH, width, height);
        const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
        pipeline = raw()
          .resize(contentRect.w, contentRect.h, { fit: "fill" })
          .extend({
            top: contentRect.y, left: contentRect.x,
            bottom: height - contentRect.y - contentRect.h, right: width - contentRect.x - contentRect.w,
            background: transparent,
          });
      }
      pipeline = opts.format === "webp"
        ? pipeline.webp({ quality: opts.quality, effort: 5 })
        : pipeline.png({ compressionLevel: 9 });

      const fileName = `${definitionId}.${opts.format}`;
      const entryBase = {
        definitionId,
        mappingStatus: mappingStatusFor(pick.method),
        matchMethod: pick.method,
        inputType: "artwork" as const,
        renderMode: "artwork" as const,
        kind: card.kind,
        layout,
        relativePath: fileName,
        artUrl: urlBase ? `${urlBase}/${fileName}` : null,
        width, height,
        format: opts.format,
        source: { relativePath: rel(pick.file), sha256: sha256(input), width: srcW, height: srcH, bytes: pick.bytes },
        crop, rotation: 0 as const, fit: opts.fit, contentRect, importedAt,
      };

      if (opts.dryRun) {
        imported.set(definitionId, { ...entryBase, sha256: "", bytes: 0 });
        return;
      }
      const out = await pipeline.toBuffer();
      // Verify what we are about to claim: decode the encoded output independently.
      const check = await sharp(out).metadata();
      if (check.width !== width || check.height !== height || check.format !== opts.format) {
        throw new Error(`output verification failed (${check.format} ${check.width}×${check.height})`);
      }
      await writeAtomic(path.join(opts.out, fileName), out);
      // One file per card: drop a stale sibling in the other format.
      await rm(path.join(opts.out, `${definitionId}.${opts.format === "webp" ? "png" : "webp"}`), { force: true });
      const hash = sha256(out);
      imported.set(definitionId, {
        ...entryBase,
        artUrl: entryBase.artUrl ? `${entryBase.artUrl}?v=${hash.slice(0, 10)}` : null,
        sha256: hash,
        bytes: out.length,
      });
    } catch (err) {
      failed.push({ file: rel(pick.file), reason: `invalid/unreadable image: ${(err as Error).message}` });
    }
  });

  // 4. Merge + prune (unknown ids, files that vanished).
  const merged: Record<string, ManifestEntry> = {};
  for (const [id, entry] of Object.entries(previous)) {
    if (!index.cards.has(id) || typeof entry?.relativePath !== "string" || !SAFE_ID.test(id)) continue;
    if (!existsSync(path.join(opts.out, path.basename(entry.relativePath)))) continue;
    merged[id] = entry;
  }
  for (const [id, entry] of imported) merged[id] = entry;
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  const manifest: Manifest = {
    schema: 2, packType: "artwork", setId, rightsStatus: "UNVERIFIED", gameplaySupported: false,
    generatedAt: importedAt, cards: sorted,
  };
  if (!opts.dryRun && (imported.size > 0 || Object.keys(previous).length > 0)) {
    await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } else if (!opts.dryRun && opts.outIsDefault) {
    await rm(opts.out, { recursive: true, force: true }); // nothing imported: don't leave an empty batch dir
  }

  // 5. Report.
  const missing = cards.filter((c) => !sorted[c.definitionId]);
  const proposed = [...imported.values()].filter((e) => e.mappingStatus === "proposed");
  printReport({ opts, files: files.length, imported, proposed, skipped, failed, ignored, cards, missing, manifestPath });

  if (opts.strict && (skipped.length || failed.length || proposed.length || missing.length)) return 1;
  return failed.length > 0 ? 2 : 0;
}

function shown(p: string): string {
  const r = path.relative(REPO_ROOT, p);
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? r : p;
}

function printReport(r: {
  opts: Options; files: number; imported: Map<string, ManifestEntry>; proposed: ManifestEntry[];
  skipped: Skip[]; failed: Skip[]; ignored: Skip[]; cards: CardDef[]; missing: CardDef[]; manifestPath: string;
}): void {
  const line = "─".repeat(64);
  console.log(`\n${line}\n Card artwork import ${r.opts.dryRun ? "(DRY RUN — nothing written)" : ""}\n${line}`);
  console.log(` input     ${r.opts.input}  (${r.files} files)`);
  console.log(` output    ${shown(r.opts.out)}  [${r.opts.format}, fit=${r.opts.fit}/${r.opts.position}, scale=${r.opts.scale}]`);

  const byKind = new Map<string, number>();
  for (const e of r.imported.values()) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  const kindSummary = [...byKind].map(([k, n]) => `${k} ${n}`).join(", ");
  console.log(`\n ✔ imported            ${r.imported.size}${kindSummary ? `  (${kindSummary})` : ""}`);
  console.log(`   of which proposed   ${r.proposed.length}  (matched by slug/name — review, or rename to full id)`);
  for (const e of r.proposed) console.log(`     ? ${e.source.relativePath} → ${e.definitionId}  [${e.matchMethod}]`);
  console.log(` ✖ skipped (id)        ${r.skipped.length}`);
  for (const s of r.skipped) console.log(`     - ${s.file}: ${s.reason}`);
  console.log(` ✖ failed (file/image) ${r.failed.length}`);
  for (const s of r.failed) console.log(`     - ${s.file}: ${s.reason}`);
  console.log(` · ignored (non-image) ${r.ignored.length}`);
  if (r.opts.verbose) for (const s of r.ignored) console.log(`     - ${s.file}`);

  const have = r.cards.length - r.missing.length;
  console.log(`\n Coverage  ${have}/${r.cards.length} cards have artwork in this pack · ${r.missing.length} still missing`);
  const missingByKind = new Map<string, CardDef[]>();
  for (const c of r.missing) missingByKind.set(c.kind, [...(missingByKind.get(c.kind) ?? []), c]);
  for (const [kind, list] of [...missingByKind].sort()) {
    console.log(`   ${kind.padEnd(13)} ${String(list.length).padStart(3)} missing`);
    if (r.opts.verbose) for (const c of list) console.log(`     - ${c.definitionId}`);
  }
  if (!r.opts.verbose && r.missing.length) console.log("   (use --verbose to list missing ids)");
  if (!r.opts.dryRun && r.imported.size) console.log(`\n manifest  ${shown(r.manifestPath)}`);
  console.log(` rights    UNVERIFIED (ADR-003) · gameplaySupported=false — do not publish without owner sign-off\n${line}\n`);
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
