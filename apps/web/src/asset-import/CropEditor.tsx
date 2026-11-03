import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import type { AssetImportAdapter, AssetSource, ImportCandidate } from "./contract";
import { boxFromDrag, coversImage, moveBox, resizeBox, type Box, type Handle } from "./cropGeometry";

type Props = {
  adapter: AssetImportAdapter;
  source: AssetSource;
  candidates: ImportCandidate[];
  selectedId: string;
  /** w/h in source px the crop must keep (already accounts for rotation), or undefined = free. */
  aspect?: number;
  disabled?: boolean;
  /** "draw" = drag on empty area draws a crop; "pan" = drag moves the view. Space / middle button always pans. */
  tool: "draw" | "pan";
  /** Drawing creates a new region instead of replacing the selected crop. */
  drawCreatesNew: boolean;
  onSelect(candidateId: string): void;
  onCrop(candidateId: string, crop: Box): void;
  onCreate(crop: Box): void;
  /** Display label per region (e.g. "#2 Dodgy Dealer"). */
  labels?: Readonly<Record<string, string>>;
  /** Enter in the viewport: save the selected region. */
  onCommit?(): void;
  /** Called with a function the parent can use to drive zoom buttons. */
  onReady?(api: ViewApi): void;
  onZoomChange?(zoom: number): void;
};
export type ViewApi = { fit(): void; zoomBy(factor: number): void; actual(): void; focus(box: Box): void };

type View = { zoom: number; x: number; y: number }; // screen = source * zoom + (x, y)
type Gesture =
  | { kind: "pan"; startX: number; startY: number; view: View }
  | { kind: "move"; id: string; start: { x: number; y: number }; crop: Box }
  | { kind: "resize"; id: string; handle: Handle; start: { x: number; y: number }; crop: Box }
  | { kind: "draw"; start: { x: number; y: number } };

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

/**
 * Crop editor over a downscaled upright view of the source. Geometry is always
 * in full-resolution source pixels (pre-rotation); only the picture is scaled.
 */
export function CropEditor(props: Props) {
  const { adapter, source, candidates, selectedId, aspect, disabled, tool, drawCreatesNew, onSelect, onCrop, onCreate, onReady, onZoomChange, labels, onCommit } = props;
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>({ zoom: 0.1, x: 0, y: 0 });
  const [live, setLive] = useState<{ id: string | null; crop: Box } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const bounds = { width: source.width, height: source.height };
  const selected = candidates.find((c) => c.candidateId === selectedId);

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

  const size = () => {
    const r = viewport.current?.getBoundingClientRect();
    return { w: r?.width ?? 800, h: r?.height ?? 600 };
  };
  const setZoomed = useCallback((next: View) => { setView(next); onZoomChange?.(next.zoom); }, [onZoomChange]);
  const fitBox = useCallback((box: Box, margin = 0.06) => {
    const { w, h } = size();
    const zoom = Math.min((w * (1 - 2 * margin)) / box.width, (h * (1 - 2 * margin)) / box.height, 8);
    setZoomed({ zoom, x: (w - box.width * zoom) / 2 - box.x * zoom, y: (h - box.height * zoom) / 2 - box.y * zoom });
  }, [setZoomed]);
  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const v = viewRef.current;
    const { w, h } = size();
    const px = cx ?? w / 2, py = cy ?? h / 2;
    const zoom = Math.max(0.02, Math.min(8, v.zoom * factor));
    const k = zoom / v.zoom;
    setZoomed({ zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  }, [setZoomed]);

  // Fit the whole source whenever it changes.
  useLayoutEffect(() => { fitBox({ x: 0, y: 0, ...bounds }, 0.03); }, [source.sourceId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onReady?.({
      fit: () => fitBox({ x: 0, y: 0, width: source.width, height: source.height }, 0.03),
      zoomBy: (f) => zoomAt(f),
      actual: () => { const s = selected?.crop; const { w, h } = size(); const cx = s ? s.x + s.width / 2 : source.width / 2, cy = s ? s.y + s.height / 2 : source.height / 2; setZoomed({ zoom: 1, x: w / 2 - cx, y: h / 2 - cy }); },
      focus: (box) => fitBox(box, 0.12),
    });
  }, [onReady, fitBox, zoomAt, setZoomed, selected?.crop, source.width, source.height]);

  // Wheel zoom must be non-passive to stop the page from scrolling.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0015)), event.clientX - r.left, event.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, image]);

  const toSource = (event: { clientX: number; clientY: number }) => {
    const r = viewport.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (event.clientX - r.left - v.x) / v.zoom, y: (event.clientY - r.top - v.y) / v.zoom };
  };
  const clampPt = (p: { x: number; y: number }) => ({ x: Math.max(0, Math.min(source.width, p.x)), y: Math.max(0, Math.min(source.height, p.y)) });

  const down = (event: RPointerEvent<HTMLDivElement>) => {
    if (disabled || !image) return;
    viewport.current?.focus({ preventScroll: true });
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as Handle | undefined;
    const regionId = target.dataset.region ?? target.closest<HTMLElement>("[data-region]")?.dataset.region;
    const p = toSource(event);
    viewport.current?.setPointerCapture(event.pointerId);
    if (event.button === 1 || spaceDown || (tool === "pan" && !regionId && !handle)) {
      gesture.current = { kind: "pan", startX: event.clientX, startY: event.clientY, view: viewRef.current };
    } else if (handle && selected) {
      gesture.current = { kind: "resize", id: selected.candidateId, handle, start: p, crop: { ...selected.crop } };
    } else if (regionId && !(tool === "draw" && (event.shiftKey || coversImage(candidates.find((x) => x.candidateId === regionId)?.crop ?? { x: 0, y: 0, width: 0, height: 0 }, bounds)))) {
      // Shift+drag, or a drag inside a whole-image region, draws instead of moving.
      const c = candidates.find((x) => x.candidateId === regionId);
      if (!c) return;
      if (regionId !== selectedId) onSelect(regionId);
      gesture.current = { kind: "move", id: regionId, start: p, crop: { ...c.crop } };
    } else {
      gesture.current = { kind: "draw", start: clampPt(p) };
    }
    event.preventDefault();
  };
  const move = (event: RPointerEvent<HTMLDivElement>) => {
    const p = toSource(event);
    setHover(p.x >= 0 && p.y >= 0 && p.x <= source.width && p.y <= source.height ? p : null);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") { setView({ ...g.view, x: g.view.x + event.clientX - g.startX, y: g.view.y + event.clientY - g.startY }); return; }
    if (g.kind === "move") { setLive({ id: g.id, crop: moveBox(g.crop, p.x - g.start.x, p.y - g.start.y, bounds) }); return; }
    if (g.kind === "resize") { setLive({ id: g.id, crop: resizeBox(g.crop, g.handle, p.x - g.start.x, p.y - g.start.y, bounds, event.altKey ? undefined : aspect) }); return; }
    setLive({ id: null, crop: boxFromDrag(g.start, clampPt(p), bounds, event.altKey ? undefined : aspect) });
  };
  const up = () => {
    const g = gesture.current;
    gesture.current = null;
    const result = live;
    setLive(null);
    if (!g || !result) return;
    if (g.kind === "draw") {
      if (result.crop.width < 8 || result.crop.height < 8) return; // a click, not a drag
      if (drawCreatesNew || !selected) onCreate(result.crop); else onCrop(selected.candidateId, result.crop);
    } else if (g.kind === "move" || g.kind === "resize") {
      onCrop(g.id, result.crop);
    }
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") { setSpaceDown(event.type === "keydown"); event.preventDefault(); return; }
    if (event.type !== "keydown" || !selected || disabled) return;
    const step = event.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = d[event.key];
    if (!delta) {
      if (event.key === "Enter") { event.preventDefault(); onCommit?.(); return; }
      if (event.key === "+" || event.key === "=") zoomAt(1.25);
      else if (event.key === "-") zoomAt(0.8);
      else if (event.key === "0") fitBox({ x: 0, y: 0, ...bounds }, 0.03);
      return;
    }
    event.preventDefault();
    const c = selected.crop;
    onCrop(selected.candidateId, event.altKey
      ? resizeBox(c, delta[0] ? "e" : "s", delta[0], delta[1], bounds, undefined, 1)
      : moveBox(c, delta[0], delta[1], bounds));
  };

  if (!adapter.sourcePreview) return <p>Adapter không hỗ trợ xem ảnh nguồn.</p>;
  const { zoom, x: ox, y: oy } = view;
  const scr = (b: Box) => ({ x: b.x * zoom + ox, y: b.y * zoom + oy, w: b.width * zoom, h: b.height * zoom });
  const drawingNew = !!live && live.id === null && (drawCreatesNew || !selected);
  const active = live && (live.id === selectedId || (live.id === null && !drawingNew)) ? live.crop : selected?.crop;
  const drawScr = drawingNew && live ? scr(live.crop) : null;
  const activeScr = active ? scr(active) : null;
  const cursor = gesture.current?.kind === "pan" || spaceDown || tool === "pan" ? (gesture.current?.kind === "pan" ? "grabbing" : "grab") : "crosshair";

  return <div className="ce-root">
    <div
      ref={viewport}
      className="ce-viewport"
      tabIndex={0}
      role="application"
      aria-label={`Vùng cắt trên ${source.relativePath}. Kéo để vẽ hoặc dời vùng; con lăn để zoom; Space + kéo để di chuyển ảnh; mũi tên dời 1 px (Shift 10 px), Alt + mũi tên đổi cỡ.`}
      style={{ cursor }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => setHover(null)}
      onKeyDown={key}
      onKeyUp={key}
    >
      {error ? <p className="ce-msg" role="alert">{error}</p> : !image ? <p className="ce-msg">Đang tải ảnh nguồn…</p> : <>
        <img className="ce-image" src={image} alt="" draggable={false} style={{ width: source.width, height: source.height, transform: `translate(${ox}px, ${oy}px) scale(${zoom})` }} />
        <svg className="ce-overlay" width="100%" height="100%">
          {activeScr && <path className="ce-dim" fillRule="evenodd" d={`M-1e5,-1e5H1e5V1e5H-1e5Z M${activeScr.x},${activeScr.y}h${activeScr.w}v${activeScr.h}h${-activeScr.w}Z`} />}
          {candidates.map((c) => {
            if (c.candidateId === selectedId) return null;
            const crop = live?.id === c.candidateId ? live.crop : c.crop;
            const s = scr(crop);
            return <g key={c.candidateId} data-region={c.candidateId} className={`ce-region ${c.excluded ? "excluded" : ""} ${c.reviewed ? "reviewed" : ""}`}>
              <rect data-region={c.candidateId} x={s.x} y={s.y} width={s.w} height={s.h} />
              {s.w > 40 && <text x={s.x + 6} y={s.y + 16}>{labels?.[c.candidateId] ?? shortLabel(c.label)}</text>}
            </g>;
          })}
          {activeScr && selected && <g className="ce-selected" data-region={live?.id === null ? undefined : selected.candidateId}>
            <rect data-region={live?.id === null ? undefined : selected.candidateId} x={activeScr.x} y={activeScr.y} width={activeScr.w} height={activeScr.h} />
            {/* rule-of-thirds guides help keep the card straight */}
            <path className="ce-thirds" d={`M${activeScr.x + activeScr.w / 3},${activeScr.y}v${activeScr.h}M${activeScr.x + (2 * activeScr.w) / 3},${activeScr.y}v${activeScr.h}M${activeScr.x},${activeScr.y + activeScr.h / 3}h${activeScr.w}M${activeScr.x},${activeScr.y + (2 * activeScr.h) / 3}h${activeScr.w}`} />
            {live?.id !== null && !disabled && HANDLES.map((h) => {
              const hx = activeScr.x + (h.includes("w") ? 0 : h.includes("e") ? activeScr.w : activeScr.w / 2);
              const hy = activeScr.y + (h.includes("n") ? 0 : h.includes("s") ? activeScr.h : activeScr.h / 2);
              return <rect key={h} data-handle={h} className="ce-handle" x={hx - 6} y={hy - 6} width={12} height={12} style={{ cursor: CURSOR[h] }} />;
            })}
            <text className="ce-size" x={activeScr.x} y={Math.max(14, activeScr.y - 8)}>{labels?.[selected.candidateId] ? `${labels[selected.candidateId]} · ` : ""}{active!.width} × {active!.height} px · ({active!.x}, {active!.y})</text>
          </g>}
          {drawScr && live && <g className="ce-drawing"><rect x={drawScr.x} y={drawScr.y} width={drawScr.w} height={drawScr.h} /><text x={drawScr.x} y={Math.max(14, drawScr.y - 8)}>Vùng mới · {live.crop.width} × {live.crop.height} px</text></g>}
        </svg>
        {hover && <span className="ce-coords" aria-hidden>x {Math.round(hover.x)} · y {Math.round(hover.y)} · zoom {(zoom * 100).toFixed(0)}%</span>}
      </>}
    </div>
  </div>;
}

const shortLabel = (label: string) => label.split(" · ").slice(-1)[0];
