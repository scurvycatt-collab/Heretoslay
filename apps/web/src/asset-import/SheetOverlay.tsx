import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AssetImportAdapter, AssetSource, ImportCandidate } from "./contract";
import { clampCrop, type Box } from "./adapters/core";

type Props = {
  adapter: AssetImportAdapter;
  source: AssetSource;
  candidates: ImportCandidate[];
  selectedId: string;
  disabled: boolean;
  onSelect(candidateId: string): void;
  onCrop(candidateId: string, crop: Box): void;
};

type Drag = { id: string; mode: "move" | "resize"; startX: number; startY: number; crop: Box; ratio: number };

/** Crop rectangles over the upright source (pixels before rotation). Drag, resize, or use the keyboard. */
export function SheetOverlay({ adapter, source, candidates, selectedId, disabled, onSelect, onCrop }: Props) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [live, setLive] = useState<{ id: string; crop: Box } | null>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!adapter.sourcePreview) return;
    const controller = new AbortController();
    setImage(null); setError("");
    adapter.sourcePreview(source, controller.signal).then(
      (result) => { if (!controller.signal.aborted) setImage(result.url); },
      (err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err)); },
    );
    return () => controller.abort();
  }, [adapter, source]);

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const commit = (id: string, crop: Box) => onCrop(id, clampCrop(crop, source.width, source.height));

  const begin = (event: PointerEvent, c: ImportCandidate, mode: Drag["mode"]) => {
    if (disabled) return;
    event.stopPropagation();
    onSelect(c.candidateId);
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { id: c.candidateId, mode, startX: event.clientX, startY: event.clientY, crop: { ...c.crop }, ratio: source.width / rect.width };
  };
  const move = (event: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (event.clientX - d.startX) * d.ratio;
    const dy = (event.clientY - d.startY) * d.ratio;
    const next = d.mode === "move"
      ? { ...d.crop, x: d.crop.x + dx, y: d.crop.y + dy }
      : { ...d.crop, width: d.crop.width + dx, height: d.crop.height + dy };
    setLive({ id: d.id, crop: clampCrop(next, source.width, source.height) });
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d && live?.id === d.id) commit(d.id, live.crop);
    setLive(null);
  };
  const key = (event: KeyboardEvent, c: ImportCandidate) => {
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = delta[event.key];
    if (!d || disabled) return;
    event.preventDefault();
    commit(c.candidateId, event.altKey
      ? { ...c.crop, width: c.crop.width + d[0], height: c.crop.height + d[1] }
      : { ...c.crop, x: c.crop.x + d[0], y: c.crop.y + d[1] });
  };

  if (!adapter.sourcePreview) return <p>Adapter không hỗ trợ xem sheet.</p>;
  return <div className="aw-sheet">
    <div className="aw-sheet-tools">
      <label>Zoom<input type="range" min={1} max={4} step={0.25} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <span>{zoom.toFixed(2)}× · {source.width} × {source.height} px nguồn (trước xoay)</span>
    </div>
    <div className="aw-sheet-scroll">
      {error ? <p role="alert">{error}</p> : !image ? <p>Đang tải sheet…</p> :
        <div className="aw-sheet-frame" ref={frame} style={{ width: `${zoom * 100}%`, aspectRatio: `${source.width} / ${source.height}` }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <img src={image} alt={`Nguồn ${source.relativePath}`} draggable={false} />
          {candidates.map((c) => {
            const crop = live?.id === c.candidateId ? live.crop : c.crop;
            const selected = c.candidateId === selectedId;
            return <button
              key={c.candidateId}
              type="button"
              className={`aw-region ${selected ? "selected" : ""} ${c.excluded ? "excluded" : ""} ${c.reviewed ? "reviewed" : ""}`}
              style={{ left: pct(crop.x, source.width), top: pct(crop.y, source.height), width: pct(crop.width, source.width), height: pct(crop.height, source.height) }}
              aria-pressed={selected}
              aria-label={`${c.label}: x ${crop.x}, y ${crop.y}, ${crop.width} × ${crop.height}${c.excluded ? ", đã loại" : ""}. Mũi tên để dời, Alt+mũi tên để đổi cỡ, Shift = 10px.`}
              disabled={disabled}
              onClick={() => onSelect(c.candidateId)}
              onPointerDown={(event) => selected && begin(event, c, "move")}
              onKeyDown={(event) => key(event, c)}
            >
              <span>{c.label.split(" · ").slice(-1)[0]}</span>
              {selected && !disabled && <i className="aw-handle" aria-hidden onPointerDown={(event) => begin(event, c, "resize")} />}
            </button>;
          })}
        </div>}
    </div>
    <small>Chọn một vùng rồi kéo để dời, kéo góc phải-dưới để đổi cỡ; hoặc dùng phím. Vùng xám = đã loại, viền xanh = đã duyệt.</small>
  </div>;
}
