import { BASE_REFERENCE_ROWS } from "./base-reference-data.ts";
import type {
  BaseReferenceDefinition,
  BaseReferencePhysicalCopy,
  BaseReferenceProvenance,
} from "./types.ts";

const SET_ID = "hts.base.v1" as const;
const INVENTORY_PAGE =
  "https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Inventory_List";
const GALLERY_PAGE =
  "https://www.unstablegameswiki.com/index.php?title=Here_To_Slay_Base_Deck_-_Card_Previews";
const EDITION_HEADING = "English Base Deck inventory (separate 2nd Edition page)";

export const BASE_REFERENCE_DEFINITIONS: readonly BaseReferenceDefinition[] =
  BASE_REFERENCE_ROWS.map((row) => {
    const [
      definitionId,
      kind,
      canonicalName,
      physicalCopyCount,
      inventorySection,
      inventoryCardUrl,
      gallerySection,
      galleryFile,
      galleryThumbnail,
      galleryCardUrl,
      artifactStatus,
      matchNote,
    ] = row;
    const provenance: BaseReferenceProvenance = {
      inventoryPage: INVENTORY_PAGE,
      inventoryRevision: "32728",
      editionHeading: EDITION_HEADING,
      inventorySection,
      inventoryCardUrl,
      galleryPage: GALLERY_PAGE,
      galleryRevision: "42555",
      gallerySection,
      galleryFile,
      galleryThumbnail,
      galleryCardUrl,
      artifactStatus,
      reconciliationStatus: "secondary_discovery",
      matchNote,
      sourceAuthority: "secondary",
      metadataConfidence: "reference_only",
      retailAuthenticity: "UNVERIFIED",
      rightsStatus: "UNVERIFIED",
    };
    return {
      definitionId,
      setId: SET_ID,
      kind,
      canonicalName,
      physicalCopyCount,
      provenance,
    };
  });

function expandPhysicalCopies(
  definitions: readonly BaseReferenceDefinition[],
): readonly BaseReferencePhysicalCopy[] {
  return definitions.flatMap((definition) =>
    Array.from({ length: definition.physicalCopyCount }, (_, index) => ({
      instanceId: `${definition.definitionId}#${String(index + 1).padStart(2, "0")}`,
      definitionId: definition.definitionId,
      setId: definition.setId,
      kind: definition.kind,
      copyIndex: index + 1,
      definitionCopyCount: definition.physicalCopyCount,
    })),
  );
}

export const BASE_REFERENCE_PHYSICAL_COPIES = {
  main: expandPhysicalCopies(
    BASE_REFERENCE_DEFINITIONS.filter(
      (definition) => definition.kind !== "monster" && definition.kind !== "party_leader",
    ),
  ),
  monster: expandPhysicalCopies(
    BASE_REFERENCE_DEFINITIONS.filter((definition) => definition.kind === "monster"),
  ),
  partyLeader: expandPhysicalCopies(
    BASE_REFERENCE_DEFINITIONS.filter((definition) => definition.kind === "party_leader"),
  ),
} as const;
