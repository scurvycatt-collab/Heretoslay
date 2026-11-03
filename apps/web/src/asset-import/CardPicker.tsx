import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CardData } from "@here-to-slay/protocol";
import { KINDS, KIND_LABEL, classOf, searchCards, type KindKey } from "./cardSearch";

type Props = {
  cards: readonly CardData[];
  value: string | null;
  onChange(definitionId: string | null): void;
  /** definitionId → labels of OTHER regions already mapped to it (same variant + asset type). */
  usedBy: ReadonlyMap<string, string[]>;
  /** Kind to pre-filter on (from the crop's card size), user can switch. */
  suggestedKind?: KindKey;
  /** Shorter list for the crop step's inspector. */
  compact?: boolean;
};

/** Searchable card chooser: type to filter (accent-insensitive), ↑/↓ + Enter to pick. */
export function CardPicker({ cards, value, onChange, usedBy, suggestedKind = "all", compact = false }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindKey>(suggestedKind);
  const [active, setActive] = useState(0);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => searchCards(cards, query, kind), [cards, query, kind]);
  const selected = value ? cards.find((card) => card.definitionId === value) : undefined;

  const pick = (card: CardData) => { onChange(card.definitionId); setQuery(""); };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(0, Math.min(results.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault(); pick(results[active]);
    } else if (event.key === "Escape") setQuery("");
  };

  return <div className={`cp ${compact ? "cp-compact" : ""}`}>
    <div className="cp-current">
      {selected
        ? <><span><b>{selected.name}</b><small>{KIND_LABEL[selected.kind]}{classOf(selected) ? ` · ${classOf(selected)}` : ""}</small></span><button type="button" onClick={() => onChange(null)}>Bỏ gán</button></>
        : <span><b>Chưa gán</b><small>Chỉ dùng được trong Preview pack</small></span>}
    </div>
    <input
      type="search"
      role="combobox"
      aria-expanded="true"
      aria-controls={listId}
      aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
      aria-label="Tìm thẻ theo tên, loại hoặc class"
      placeholder="Gõ tên thẻ… (vd: dodgy, wizard, monster)"
      value={query}
      onChange={(event) => { setQuery(event.target.value); setActive(0); }}
      onKeyDown={key}
    />
    <div className="cp-kinds" role="radiogroup" aria-label="Lọc theo loại">
      {KINDS.map((k) => <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} onClick={() => { setKind(k.key); setActive(0); }}>{k.label}</button>)}
    </div>
    <ul className="cp-list" id={listId} role="listbox" ref={list} aria-label="Kết quả">
      {results.map((card, index) => {
        const used = usedBy.get(card.definitionId);
        return <li key={card.definitionId} id={`${listId}-${index}`} role="option" aria-selected={card.definitionId === value}
          className={`${index === active ? "active" : ""} ${card.definitionId === value ? "chosen" : ""}`}
          onMouseEnter={() => setActive(index)} onClick={() => pick(card)}>
          <b>{card.name}</b>
          <small>{KIND_LABEL[card.kind]}{classOf(card) ? ` · ${classOf(card)}` : ""}{used ? ` · ⚠ đã gán: ${used.join(", ")}` : ""}</small>
        </li>;
      })}
      {!results.length && <li className="cp-empty">Không có thẻ base nào khớp. Thẻ expansion chưa có trong catalog — để “Chưa gán”.</li>}
    </ul>
    <small className="cp-count">{results.length} / {cards.length} thẻ · ↑/↓ để chọn, Enter để gán</small>
  </div>;
}
