export type BaseReferenceKind =
  | "challenge"
  | "cursed_item"
  | "hero"
  | "item"
  | "magic"
  | "modifier"
  | "monster"
  | "party_leader";

export type ArtifactReviewStatus =
  | "link_checked_secondary"
  | "visual_checked_secondary";

export type BaseReferenceRow = readonly [
  definitionId: string,
  kind: BaseReferenceKind,
  canonicalName: string,
  physicalCopyCount: number,
  inventorySection: string,
  inventoryCardUrl: string,
  gallerySection: string,
  galleryFile: string,
  galleryThumbnail: string,
  galleryCardUrl: string,
  artifactStatus: ArtifactReviewStatus,
  matchNote: string,
];

export interface BaseReferenceProvenance {
  readonly inventoryPage: string;
  readonly inventoryRevision: "32728";
  readonly editionHeading: string;
  readonly inventorySection: string;
  readonly inventoryCardUrl: string;
  readonly galleryPage: string;
  readonly galleryRevision: "42555";
  readonly gallerySection: string;
  readonly galleryFile: string;
  readonly galleryThumbnail: string;
  readonly galleryCardUrl: string;
  readonly artifactStatus: ArtifactReviewStatus;
  readonly reconciliationStatus: "secondary_discovery";
  readonly matchNote: string;
  readonly sourceAuthority: "secondary";
  readonly metadataConfidence: "reference_only";
  readonly retailAuthenticity: "UNVERIFIED";
  readonly rightsStatus: "UNVERIFIED";
}

export interface BaseReferenceDefinition {
  readonly definitionId: string;
  readonly setId: "hts.base.v1";
  readonly kind: BaseReferenceKind;
  readonly canonicalName: string;
  readonly physicalCopyCount: number;
  readonly provenance: BaseReferenceProvenance;
}

export interface BaseReferencePhysicalCopy {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly setId: "hts.base.v1";
  readonly kind: BaseReferenceKind;
  readonly copyIndex: number;
  readonly definitionCopyCount: number;
}
