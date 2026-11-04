import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const sourceDir = new URL("../apps/web/src/", import.meta.url);
const output = new URL("../apps/web/src/i18n.vi.json", import.meta.url);
const strings = new Set();

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(tsx?|json)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(/>([^<>{}\n][^<>{}]*)</g)) add(match[1]);
      for (const match of source.matchAll(/(["'`])([^"'`\n]*[A-Za-z][^"'`\n]*)\1/g)) add(match[2]);
    }
  }
}

function add(value) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 500) return;
  if (/^(https?:|[.#/]|[a-z0-9_-]+$)/.test(text)) return;
  if (/[{}<>=$]|\\[nrt]|\.(tsx?|css|json|webp|png|svg)$/.test(text)) return;
  if (!/[A-Za-z]{2}/.test(text)) return;
  strings.add(text);
}

await walk(sourceDir.pathname);
const cards = JSON.parse(await readFile(new URL("../apps/worker/src/content/base-cards.json", import.meta.url), "utf8"));
for (const card of cards.cards) {
  if (card.text) add(card.text);
  if (card.penaltyText) add(card.penaltyText);
}

const existing = await readFile(output, "utf8").then(JSON.parse).catch(() => ({}));
const catalog = { ...existing };
const pending = [...strings].sort().filter((text) => !catalog[text]);
async function translate(text) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.search = new URLSearchParams({ client: "gtx", sl: "en", tl: "vi", dt: "t", q: text });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Translation failed (${response.status}) for ${text}`);
  const body = await response.json();
  return [text, body[0].map((part) => part[0]).join("")];
}
for (let index = 0; index < pending.length; index += 8) {
  const entries = await Promise.all(pending.slice(index, index + 8).map(translate));
  for (const [text, translation] of entries) catalog[text] = translation;
  await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`);
}
await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${Object.keys(catalog).length} Vietnamese translations to ${output.pathname.replace(root.pathname, "")}`);
