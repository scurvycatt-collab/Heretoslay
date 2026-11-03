import { useMemo, useState } from "react";
import { cardCatalog, cardAssets } from "./catalog";
import { CardPreview } from "./CardPreview";

export function CardGallery() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const kinds = [...new Set(cardCatalog.map((card) => card.kind))];
  const visible = useMemo(() => cardCatalog.filter((card) => (kind === "all" || card.kind === kind) && `${card.name} ${card.definitionId}`.toLowerCase().includes(query.toLowerCase())), [query, kind]);
  return <main className="card-gallery">
    <header className="gallery-header"><a href="/">← LOBBY</a><span>HERE TO SLAY / BASE COLLECTION</span><small>{cardCatalog.length} DEFINITIONS</small></header>
    <div className="gallery-intro"><div><p className="gallery-eyebrow">THE CARD TABLE</p><h1>Build your party.<br /><em>Know your cards.</em></h1><p>Browse the base set. Open a card to read its effect.</p></div><aside><b>Artwork pending</b><p>Original placeholder frames. Artwork supplied: {Object.keys(cardAssets).length}/{cardCatalog.length}.</p><small>Layout reference: CARD_TEMPLATE_SPEC · ADR-003 PROPOSED.<br />Art rights FAN_MADE_NON_COMMERCIAL (ADR-004) · DMCA: scurvycatt@gmail.com. Patua One / Source Sans Pro use Georgia / Arial fallbacks until font files are supplied.</small></aside></div>
    <form className="gallery-toolbar" onSubmit={(event) => event.preventDefault()}><label>Find a card<input type="search" placeholder="Search name or card ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Card type<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All types</option>{kinds.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><output aria-live="polite">{visible.length} cards</output></form>
    <section className="gallery-grid" aria-label="Base card collection">{visible.map((card) => <article key={card.definitionId}><CardPreview definitionId={card.definitionId} name={card.name} /><div className="gallery-card-caption"><h2>{card.name}</h2><small>{card.kind.replaceAll("_", " ")} · ×{card.quantity}</small></div></article>)}</section>
    {visible.length === 0 && <p className="gallery-empty">No cards match. Try another name or type.</p>}
  </main>;
}
