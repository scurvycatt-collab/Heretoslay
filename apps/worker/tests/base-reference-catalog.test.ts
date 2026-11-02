import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BASE_REFERENCE_DEFINITIONS,
  BASE_REFERENCE_PHYSICAL_COPIES,
} from "../src/content/base-reference.ts";

function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      record.push(field);
      field = "";
    } else if (char === "\n" && !quoted) {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [headers, ...rows] = records;
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

const csvRows = parseCsv(
  readFileSync(
    new URL("../../../docs/content/BASE_MANIFEST_RECONCILIATION.csv", import.meta.url),
    "utf8",
  ),
);

test("reference definitions preserve every reconciled CSV metadata field and source caveat", () => {
  assert.equal(csvRows.length, 95);
  assert.equal(BASE_REFERENCE_DEFINITIONS.length, csvRows.length);
  const byId = new Map(
    BASE_REFERENCE_DEFINITIONS.map((definition) => [definition.definitionId, definition]),
  );
  assert.equal(byId.size, 95);

  for (const row of csvRows) {
    const definition = byId.get(row.card_id);
    assert.ok(definition, row.card_id);
    assert.equal(definition.setId, row.set_id);
    assert.equal(definition.kind, row.kind);
    assert.equal(definition.canonicalName, row.canonical_name);
    assert.equal(definition.physicalCopyCount, Number(row.quantity));
    assert.deepEqual(
      {
        inventoryPage: definition.provenance.inventoryPage,
        inventoryRevision: definition.provenance.inventoryRevision,
        editionHeading: definition.provenance.editionHeading,
        inventorySection: definition.provenance.inventorySection,
        inventoryCardUrl: definition.provenance.inventoryCardUrl,
        galleryPage: definition.provenance.galleryPage,
        galleryRevision: definition.provenance.galleryRevision,
        gallerySection: definition.provenance.gallerySection,
        galleryFile: definition.provenance.galleryFile,
        galleryThumbnail: definition.provenance.galleryThumbnail,
        galleryCardUrl: definition.provenance.galleryCardUrl,
        artifactStatus: definition.provenance.artifactStatus,
        reconciliationStatus: definition.provenance.reconciliationStatus,
        matchNote: definition.provenance.matchNote,
      },
      {
        inventoryPage: row.inventory_page,
        inventoryRevision: row.inventory_revision,
        editionHeading: row.edition_heading,
        inventorySection: row.inventory_section,
        inventoryCardUrl: row.inventory_card_url,
        galleryPage: row.gallery_page,
        galleryRevision: row.gallery_revision,
        gallerySection: row.gallery_section,
        galleryFile: row.gallery_file,
        galleryThumbnail: row.gallery_thumbnail,
        galleryCardUrl: row.gallery_card_url,
        artifactStatus: row.artifact_status,
        reconciliationStatus: row.reconciliation_status,
        matchNote: row.match_note,
      },
      row.card_id,
    );
    assert.equal(definition.provenance.sourceAuthority, "secondary");
    assert.equal(definition.provenance.metadataConfidence, "reference_only");
    assert.equal(definition.provenance.retailAuthenticity, "UNVERIFIED");
    assert.equal(definition.provenance.rightsStatus, "UNVERIFIED");
    assert.equal("effect" in definition, false);
    assert.equal("art" in definition, false);
  }
});

test("physical expansion preserves copy counts without definition or instance collisions", () => {
  const { main, monster, partyLeader } = BASE_REFERENCE_PHYSICAL_COPIES;
  assert.equal(
    BASE_REFERENCE_DEFINITIONS.filter(
      (definition) => definition.kind !== "monster" && definition.kind !== "party_leader",
    ).length,
    74,
  );
  assert.equal(
    BASE_REFERENCE_DEFINITIONS.filter((definition) => definition.kind === "monster").length,
    15,
  );
  assert.equal(
    BASE_REFERENCE_DEFINITIONS.filter((definition) => definition.kind === "party_leader").length,
    6,
  );
  assert.equal(main.length, 115);
  assert.equal(monster.length, 15);
  assert.equal(partyLeader.length, 6);

  const copies = [...main, ...monster, ...partyLeader];
  assert.equal(
    copies.length,
    BASE_REFERENCE_DEFINITIONS.reduce(
      (total, definition) => total + definition.physicalCopyCount,
      0,
    ),
  );
  assert.equal(new Set(copies.map((copy) => copy.instanceId)).size, copies.length);
  assert.equal(copies.some((copy) => copy.instanceId === copy.definitionId), false);

  for (const definition of BASE_REFERENCE_DEFINITIONS) {
    const definitionCopies = copies.filter(
      (copy) => copy.definitionId === definition.definitionId,
    );
    assert.equal(definitionCopies.length, definition.physicalCopyCount, definition.definitionId);
    assert.deepEqual(
      definitionCopies.map((copy) => copy.copyIndex),
      Array.from({ length: definition.physicalCopyCount }, (_, index) => index + 1),
    );
    assert.equal(
      definitionCopies.every(
        (copy) => copy.definitionCopyCount === definition.physicalCopyCount,
      ),
      true,
    );
  }
});
