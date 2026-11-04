import type { ImportDraft } from "./contract";

// Cropped JPGs already reviewed in the local Kickstarter sample. Not imported base assets.
const hero = new URL("../../../../assets/cards/expansions/kickstarter/preview/fronts/ks-preview-01-r1-c2.jpg", import.meta.url).href;
const item = new URL("../../../../assets/cards/expansions/kickstarter/preview/fronts/ks-preview-03-r1-c1.jpg", import.meta.url).href;
const monster = new URL("../../../../assets/cards/expansions/kickstarter/preview/fronts/ks-preview-04-r1-c1.jpg", import.meta.url).href;
export function createDemoDraft(): ImportDraft {
  return {
    schema: 1,
    collection: "Kickstarter · UI demo",
    sources: [
      { sourceId: "sheet-01", relativePath: "Print 01 / Poker - Front.jpg", sha256: null, width: 3600, height: 5400 },
      { sourceId: "sheet-03", relativePath: "Print 03 / Poker - Front.jpg", sha256: null, width: 3600, height: 5400 },
      { sourceId: "sheet-04", relativePath: "Print 04 / Tarot - Front.jpg", sha256: null, width: 3600, height: 5400 },
    ],
    candidates: [
      { candidateId: "demo-hoodwink", sourceId: "sheet-01", label: "Hoodwink", previewUrl: hero, template: "poker", crop: { x: 1320, y: 304, width: 960, height: 664 } },
      { candidateId: "demo-mask", sourceId: "sheet-03", label: "Mask of Misfortune", previewUrl: item, template: "poker", crop: { x: 196, y: 304, width: 960, height: 664 } },
      { candidateId: "demo-monster", sourceId: "sheet-04", label: "Calamity Mongrel", previewUrl: monster, template: "tarot", crop: { x: 356, y: 75, width: 1417, height: 827 } },
    ].map((card) => ({ ...card, template: card.template as "poker" | "tarot", assetType: "complete_card_front", side: "front", rotation: 270, definitionId: null, variant: "default", reviewed: false, excluded: false, provenance: { origin: "Owner-provided Kickstarter sheet · local visual fixture", rightsStatus: "FAN_MADE_NON_COMMERCIAL" as const } })),
  };
}
