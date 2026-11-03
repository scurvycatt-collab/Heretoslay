import { useCallback, useEffect, useRef, useState } from "react";
import type { CardData } from "@here-to-slay/protocol";
import { cardById } from "../cards/catalog";
import { CardRenderer } from "../cards/CardRenderer";
import { createDemoDraft } from "./fixtures";
import { TAKEDOWN_CONTACT, validateDraft, type AssetImportAdapter, type ExportMode, type ExportProgress, type ExportResult, type ImportCandidate, type ImportDraft, type QuarterTurn } from "./contract";
import { parseDraftJson, resumeDraft } from "./adapters/core";
import { CropEditor, type ViewApi } from "./CropEditor";
import { CardPicker } from "./CardPicker";
import { ART_LAYOUTS, CARD_SIZE, artLayoutForKind, expandBox, fitAspect, sourceAspect, splitGrid, type ArtLayout, type Box } from "./cropGeometry";
import "./workbench.css";

const steps = ["Nguồn ảnh", "Cắt & xoay", "Gán thẻ", "Kiểm tra & xuất"];
/** Everything that changes the rendered output. A preview is valid only for the key it was rendered with. */
const renderKey = (c: ImportCandidate) => JSON.stringify([c.sourceId, c.crop, c.rotation, c.template, c.assetType, c.assetType === "artwork" ? [c.definitionId, c.artLayout] : null]);
type PreviewState = { key: string; url?: string; error?: string; loading: boolean };

/** Art layout an artwork crop is framed with: the mapped card's layout, else the chosen one. */
function layoutOf(c: ImportCandidate): ArtLayout {
  return artLayoutForKind(c.definitionId ? cardById.get(c.definitionId)?.kind : undefined) ?? c.artLayout ?? (c.template === "tarot" ? "monster" : "hero");
}
/** The rectangle the output fills: card canvas (complete face) or art box (artwork). */
function targetOf(c: ImportCandidate) {
  return c.assetType === "artwork" ? ART_LAYOUTS[layoutOf(c)] : CARD_SIZE[c.template];
}
/** A real definition of the right layout, used only to show WHERE artwork lands when nothing is mapped yet. */
function sampleCardFor(layout: ArtLayout): CardData | undefined {
  return [...cardById.values()].find((card) => artLayoutForKind(card.kind) === layout);
}

const catalogCards = [...cardById.values()];

/** Asset import workbench (dev route /?asset-import). Importer I/O belongs to the adapter. */
export function AssetImportWorkbench({ adapter }: { adapter?: AssetImportAdapter }) {
  const [draft, setDraft] = useState<ImportDraft>(createDemoDraft);
  const [selected, setSelected] = useState("demo-hoodwink");
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<ExportMode>("preview");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [demo, setDemo] = useState(true);
  const [pendingResume, setPendingResume] = useState<ImportDraft | null>(null);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [tool, setTool] = useState<"draw" | "pan">("draw");
  const [lockAspect, setLockAspect] = useState(true);
  const [drawCreatesNew, setDrawCreatesNew] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [grid, setGrid] = useState({ rows: 2, cols: 2, gutterX: 0, gutterY: 0, snap: true });
  const viewApi = useRef<ViewApi | null>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const draftChooser = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => () => { operation.current?.abort(); adapter?.dispose(); }, [adapter]);

  const card = draft.candidates.find((candidate) => candidate.candidateId === selected);
  const source = draft.sources.find((entry) => entry.sourceId === card?.sourceId);
  const issues = validateDraft(draft, mode, cardById);
  const cardIssues = issues.filter((issue) => issue.candidateId === selected);
  const included = draft.candidates.filter((entry) => !entry.excluded);
  const reviewedCount = included.filter((entry) => entry.reviewed).length;
  const sheetCandidates = source ? draft.candidates.filter((entry) => entry.sourceId === source.sourceId) : [];
  const target = card ? targetOf(card) : null;
  const aspect = card && target && lockAspect ? sourceAspect(target, card.rotation) : undefined;
  const preview = card ? previews[card.candidateId] : undefined;
  // Other regions already mapped to each card with the same variant + asset type (would collide in a mapped pack).
  const usedBy = new Map<string, string[]>();
  if (card) for (const other of draft.candidates) {
    if (other.candidateId === card.candidateId || other.excluded || !other.definitionId || other.variant !== card.variant || other.assetType !== card.assetType) continue;
    usedBy.set(other.definitionId, [...(usedBy.get(other.definitionId) ?? []), other.label]);
  }
  const ratioOff = card && target ? Math.abs(card.crop.width / card.crop.height / sourceAspect(target, card.rotation) - 1) : 0;
  const ratioWarn = ratioOff > 0.03 ? ratioOff : 0;
  const previewFresh = !!card && (demo ? !!card.previewUrl : !!preview?.url && preview.key === renderKey(card) && !preview.loading);
  const previewUrl = demo ? card?.previewUrl ?? undefined : preview?.url;

  // ---------------------------------------------------------------- draft edits
  const patch = useCallback((candidateId: string, changes: Partial<ImportCandidate>) => {
    setResult(null);
    setDraft((current) => ({
      ...current,
      candidates: current.candidates.map((entry) => {
        if (entry.candidateId !== candidateId) return entry;
        const next = { ...entry, ...changes };
        // Any change to what gets rendered invalidates the review.
        return renderKey(next) !== renderKey(entry) ? { ...next, reviewed: false } : next;
      }),
    }));
  }, []);
  const update = (changes: Partial<ImportCandidate>) => { if (card) patch(card.candidateId, changes); };
  const newId = (base: string, taken: Set<string>) => { let n = 1; while (taken.has(`${base}-x${n}`)) n++; return `${base}-x${n}`; };
  const createRegions = (template: ImportCandidate, crops: Array<Box & { row?: number; column?: number }>, replaceSelected: boolean) => {
    const taken = new Set(draftRef.current.candidates.map((c) => c.candidateId));
    const base = template.sourceId.replace(/^src-/, "");
    const made = crops.map((crop, i) => {
      const candidateId = newId(base, taken); taken.add(candidateId);
      const where = crop.row ? `r${crop.row} c${crop.column}` : `vùng ${i + 1}`;
      return { ...template, candidateId, label: `${template.label.split(" · ")[0]} · ${where}`, crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height }, previewUrl: null, reviewed: false, excluded: false, definitionId: null };
    });
    setDraft((current) => {
      const index = current.candidates.findIndex((c) => c.candidateId === template.candidateId);
      const list = [...current.candidates];
      if (replaceSelected && index >= 0) list.splice(index, 1, ...made); else list.splice(index + 1, 0, ...made);
      return { ...current, candidates: list };
    });
    setResult(null);
    if (made[0]) setSelected(made[0].candidateId);
    return made;
  };

  // ---------------------------------------------------------------- operations
  async function run(task: (signal: AbortSignal) => Promise<void>) {
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setProgress(null); setNotice("");
    try { await task(controller.signal); }
    catch (error) { if (operation.current === controller || !controller.signal.aborted) setNotice(controller.signal.aborted ? "Đã hủy thao tác. Draft vẫn được giữ; có thể thử lại." : `Lỗi: ${error instanceof Error ? error.message : String(error)}`); }
    finally { if (operation.current === controller) { setBusy(false); setProgress(null); operation.current = null; } }
  }
  const loadFiles = (files: File[]) => {
    if (!adapter || !files.length) return;
    void run(async (signal) => {
      const inspected = await adapter.inspect(files, signal);
      if (signal.aborted) return;
      let next = inspected;
      let message = `Đã đọc ${inspected.sources.length} ảnh · ${inspected.candidates.length} vùng đề xuất · ${inspected.rejected?.length ?? 0} file bị từ chối. Ảnh không khớp sheet đã biết được mở nguyên ảnh — vẽ vùng hoặc chia lưới để cắt.`;
      if (pendingResume) {
        const resumed = resumeDraft(pendingResume, inspected);
        next = resumed.draft;
        message = `Resume draft: khớp hash ${resumed.matched}/${pendingResume.sources.length} nguồn.${resumed.missing.length ? ` Thiếu: ${resumed.missing.join(", ")}.` : ""} ${message}`;
        setPendingResume(null);
      }
      setDraft(next); setSelected(next.candidates.find((c) => !c.excluded)?.candidateId ?? next.candidates[0]?.candidateId ?? "");
      setPreviews({}); setDemo(false); setResult(null); setStep(1);
      setNotice(message);
    });
  };

  // Live output preview: re-rendered automatically (debounced) whenever the crop/rotation/type changes.
  // Independent of `run`, so it never blocks the form or cancels an export.
  const previewJob = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!adapter || demo || !card || !source || cardIssues.some((issue) => issue.code === "crop_bounds")) return;
    const key = renderKey(card);
    const existing = previews[card.candidateId];
    if (existing?.key === key && (existing.loading || existing.url || existing.error)) return;
    const id = card.candidateId;
    const snapshot = card;
    const timer = window.setTimeout(() => {
      previewJob.current?.abort();
      const controller = new AbortController(); previewJob.current = controller;
      setPreviews((current) => ({ ...current, [id]: { ...current[id], key, loading: true, error: undefined } }));
      adapter.preview(source, snapshot, controller.signal).then(
        (url) => { if (!controller.signal.aborted) setPreviews((current) => current[id]?.key === key ? { ...current, [id]: { key, url, loading: false } } : current); },
        (error: unknown) => { if (!controller.signal.aborted) setPreviews((current) => ({ ...current, [id]: { key, loading: false, error: error instanceof Error ? error.message : String(error) } })); },
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [adapter, demo, card, source, cardIssues.length, previews]); // eslint-disable-line react-hooks/exhaustive-deps

  const snapToContent = (candidates: ImportCandidate[]) => {
    if (!adapter?.detectContent || !source) return;
    void run(async (signal) => {
      let changed = 0;
      for (const c of candidates) {
        // Look a little beyond the current box so a card cut short by a rough box/grid is found whole.
        const found = await adapter.detectContent!(source, expandBox(c.crop, 0.1, source), signal);
        if (signal.aborted) return;
        if (found && JSON.stringify(found) !== JSON.stringify(c.crop)) { patch(c.candidateId, { crop: found }); changed++; }
      }
      setNotice(changed ? `Đã bắt sát mép ${changed}/${candidates.length} vùng. Kiểm tra lại kết quả xuất.` : "Không tìm thấy mép rõ ràng (nền không đồng nhất?). Hãy chỉnh tay.");
    });
  };
  const applyGrid = () => {
    if (!card) return;
    try {
      const cells = splitGrid(card.crop, grid.rows, grid.cols, grid.gutterX, grid.gutterY);
      const made = createRegions(card, cells, true);
      setNotice(`Đã chia thành ${made.length} vùng.`);
      if (grid.snap && adapter?.detectContent) window.setTimeout(() => snapToContent(made), 0);
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const setAssetType = (assetType: ImportCandidate["assetType"]) => {
    if (!card || card.assetType === assetType) return;
    const next: ImportCandidate = { ...card, assetType, artLayout: assetType === "artwork" ? layoutOf(card) : card.artLayout };
    if (assetType === "artwork") next.template = ART_LAYOUTS[layoutOf(next)].template;
    // The crop is kept as is: switching back and forth must never lose work. A ratio warning offers "Khớp tỉ lệ".
    update({ assetType, artLayout: next.artLayout, template: next.template });
  };
  const rotate = (delta: 90 | -90) => { if (card) update({ rotation: (((card.rotation + delta) % 360 + 360) % 360) as QuarterTurn }); };

  const saveDraft = () => {
    const blob = new Blob([JSON.stringify({ ...draft, candidates: draft.candidates.map(({ previewUrl: _url, ...candidate }) => candidate) }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "card-import-draft.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Đã tải draft JSON. Đây là kế hoạch import, chưa phải bộ PNG.");
  };
  const openDraft = async (file: File | undefined) => {
    if (!file) return;
    try {
      const saved = parseDraftJson(JSON.parse(await file.text()));
      setPendingResume(saved);
      setNotice(`Đã mở draft "${saved.collection}" (${saved.candidates.length} vùng). Chọn lại folder nguồn — nguồn được đối chiếu bằng SHA-256, không theo đường dẫn.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const removeRegion = () => {
    if (!card) return;
    const rest = draft.candidates.filter((c) => c.candidateId !== card.candidateId);
    setDraft({ ...draft, candidates: rest });
    setSelected(rest.find((c) => c.sourceId === card.sourceId)?.candidateId ?? rest[0]?.candidateId ?? ""); setResult(null);
  };
  const reviewAndNext = () => {
    if (!card) return;
    update({ reviewed: true });
    const order = draft.candidates.filter((c) => !c.excluded);
    const next = order.slice(order.findIndex((c) => c.candidateId === card.candidateId) + 1).find((c) => !c.reviewed);
    if (next) setSelected(next.candidateId);
  };
  const doExport = () => {
    if (!adapter) return;
    void run(async (signal) => {
      const exported = await adapter.export(draft, mode, signal, setProgress);
      if (!signal.aborted) setResult(exported);
    });
  };
  const resetDemo = () => { setDraft(createDemoDraft()); setSelected("demo-hoodwink"); setPreviews({}); setDemo(true); setResult(null); setNotice(""); setPendingResume(null); };
  const onReady = useCallback((api: ViewApi) => { viewApi.current = api; }, []);

  const editing = step === 1 && !demo && !!adapter && !!source;

  return <main className="asset-workbench">
    <header className="aw-header"><a href="/?cards">← COLLECTION</a><strong>HERE TO SLAY <span>/ ASSET WORKBENCH</span></strong><span className="aw-badge">{demo ? "UI DEMO" : "LOCAL IMPORT"}</span></header>
    <section className="aw-title"><div><p className="aw-eyebrow">CARD ASSET PIPELINE</p><h1>Một nguồn ảnh.<br /><em>Một bộ thẻ nhất quán.</em></h1></div><p>Chọn nguồn, cắt từng thẻ trên ảnh gốc, gán ID và xuất đúng khổ webgame. Import ảnh không thay đổi luật hoặc bật expansion.</p></section>
    <div className="aw-banner" role="status">{demo ? "Đang xem 3 thẻ demo. Bấm “＋ Chọn folder ảnh” để cắt ảnh thật." : "Draft chỉ nằm trong phiên hiện tại — tải draft JSON trước khi đóng trang. Ảnh xử lý trong trình duyệt, không tải lên đâu."}{!adapter && " Adapter chưa nối; chọn folder và xuất PNG đang khóa."}{pendingResume && ` Đang chờ folder để resume draft "${pendingResume.collection}".`}</div>
    <nav className="aw-steps" aria-label="Các bước import">{steps.map((label, index) => <button key={label} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span>0{index + 1}</span>{label}</button>)}</nav>
    <div className="aw-toolbar">
      <input ref={chooser} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" {...{ webkitdirectory: "" }} onChange={(event) => { loadFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <input ref={draftChooser} type="file" hidden accept="application/json,.json" onChange={(event) => { void openDraft(event.target.files?.[0]); event.target.value = ""; }} />
      <button disabled={!adapter || busy} onClick={() => chooser.current?.click()}>＋ Chọn folder ảnh</button>
      <button disabled={!adapter || busy} onClick={() => draftChooser.current?.click()}>Mở draft JSON</button>
      <button disabled={busy} onClick={resetDemo}>Nạp lại demo</button>
      <button onClick={saveDraft}>Tải draft JSON</button>
      <span>{draft.sources.length} ảnh · {included.length}/{draft.candidates.length} vùng được chọn · {reviewedCount}/{included.length} đã duyệt</span>
    </div>

    <div className={`aw-layout ${editing ? "aw-layout-edit" : ""}`}>
      <aside className="aw-panel aw-sources"><h2>01 / Ảnh & vùng cắt</h2>
        {draft.sources.map((entry) => <section key={entry.sourceId}><p className="aw-source-name">{entry.relativePath}</p><small>{entry.width} × {entry.height} · {entry.sha256 ? `SHA-256 ${entry.sha256.slice(0, 10)}…` : "Chưa hash"}</small>{draft.candidates.filter((candidate) => candidate.sourceId === entry.sourceId).map((candidate) => <button className={`aw-candidate ${selected === candidate.candidateId ? "selected" : ""}`} key={candidate.candidateId} aria-pressed={selected === candidate.candidateId} onClick={() => { setSelected(candidate.candidateId); setNotice(""); }}><span>{candidate.label}</span><small>{candidate.excluded ? "Đã loại" : candidate.reviewed ? "✓ Đã duyệt" : "Chờ duyệt"} · {candidate.assetType === "artwork" ? `artwork ${layoutOf(candidate)}` : `mặt ${candidate.template}`}{candidate.definitionId ? ` · ${cardById.get(candidate.definitionId)?.name ?? candidate.definitionId}` : ""}</small></button>)}</section>)}
        {!draft.sources.length && <p>Chưa có ảnh nguồn. Chọn folder để bắt đầu.</p>}
        {!!draft.rejected?.length && <section className="aw-rejected"><p className="aw-source-name">File bị từ chối ({draft.rejected.length})</p><ul>{draft.rejected.map((entry) => <li key={entry.relativePath}><b>{entry.relativePath}</b><small>{entry.message}</small></li>)}</ul></section>}
      </aside>

      <section className="aw-panel aw-canvas">
        <div className="aw-panel-heading"><h2>{card?.label ?? "Chưa chọn vùng"}</h2><span>{card?.assetType === "artwork" ? `ARTWORK · khung ${layoutOf(card)}` : "NGUYÊN MẶT THẺ"}</span></div>
        {editing && card && source ? <>
          <div className="ce-toolbar" role="toolbar" aria-label="Công cụ cắt">
            <div className="ce-group" role="radiogroup" aria-label="Thao tác chuột">
              <button role="radio" aria-checked={tool === "draw"} onClick={() => setTool("draw")} title="Kéo trên ảnh để vẽ vùng cắt">⬚ Vẽ vùng</button>
              <button role="radio" aria-checked={tool === "pan"} onClick={() => setTool("pan")} title="Kéo để di chuyển ảnh (hoặc giữ Space)">✥ Kéo ảnh</button>
            </div>
            <div className="ce-group" aria-label="Zoom">
              <button onClick={() => viewApi.current?.zoomBy(0.8)} aria-label="Thu nhỏ">−</button>
              <output>{Math.round(zoom * 100)}%</output>
              <button onClick={() => viewApi.current?.zoomBy(1.25)} aria-label="Phóng to">＋</button>
              <button onClick={() => viewApi.current?.fit()} title="Xem toàn bộ ảnh (phím 0)">Toàn ảnh</button>
              <button onClick={() => viewApi.current?.focus(card.crop)} title="Phóng tới vùng đang chọn">Tới vùng</button>
              <button onClick={() => viewApi.current?.actual()} title="1 px nguồn = 1 px màn hình">100%</button>
            </div>
            <label className="ce-toggle" title="Khi vẽ / kéo tay nắm, giữ đúng tỉ lệ của ảnh xuất"><input type="checkbox" checked={lockAspect} onChange={(event) => setLockAspect(event.target.checked)} />Khoá tỉ lệ {target ? `${target.width}:${target.height}` : ""}</label>
            <label className="ce-toggle"><input type="checkbox" checked={drawCreatesNew} onChange={(event) => setDrawCreatesNew(event.target.checked)} />Vẽ = thêm vùng mới</label>
          </div>
          <CropEditor adapter={adapter!} source={source} candidates={sheetCandidates} selectedId={selected} aspect={aspect} disabled={busy} tool={tool} drawCreatesNew={drawCreatesNew}
            onSelect={(id) => { setSelected(id); setNotice(""); }}
            onCrop={(id, crop) => patch(id, { crop })}
            onCreate={(crop) => createRegions(card, [crop], false)}
            onReady={onReady} onZoomChange={setZoom} />
          <p className="ce-help">Kéo trên ảnh để <b>vẽ vùng</b> (Shift + kéo: vẽ đè lên vùng có sẵn) · kéo trong vùng để <b>dời</b> · kéo 8 ô vuông để <b>đổi cỡ</b> (giữ Alt = bỏ khoá tỉ lệ) · con lăn chuột để <b>zoom</b> · giữ Space hoặc nút giữa để <b>kéo ảnh</b> · mũi tên dời 1 px (Shift 10 px), Alt + mũi tên đổi cỡ.</p>
        </> : <ResultView card={card} url={previewUrl} loading={!!preview?.loading} error={preview?.error} demo={demo} />}
      </section>

      <aside className="aw-panel aw-inspector"><h2>{steps[step]}</h2>{card && <fieldset disabled={busy}>
        {step === 0 && <><p>Đọc PNG/JPEG/WebP từ folder được chọn (nhận diện theo nội dung file). Sheet in 3600×5400 của bộ Kickstarter được đề xuất sẵn lưới; ảnh khác mở nguyên ảnh để bạn tự vẽ vùng hoặc chia lưới ở bước 2.</p><label>Tên bộ ảnh<input value={draft.collection} onChange={(event) => setDraft({ ...draft, collection: event.target.value })} /></label><dl><dt>Đường dẫn tương đối</dt><dd>{source?.relativePath}</dd><dt>Hash nguồn</dt><dd>{source?.sha256 ?? "Chưa tính — demo không đủ điều kiện xuất"}</dd></dl></>}

        {(step === 1 || step === 2) && <AssetTypePicker value={card.assetType} onChange={setAssetType} />}

        {step === 1 && <>
          {card.assetType === "artwork"
            ? <label>Khung tranh{card.definitionId ? <small> (theo thẻ đã gán: {cardById.get(card.definitionId)?.name})</small> : null}<select value={layoutOf(card)} disabled={!!card.definitionId} onChange={(event) => { const layout = event.target.value as ArtLayout; update({ artLayout: layout, template: ART_LAYOUTS[layout].template }); }}>{(Object.keys(ART_LAYOUTS) as ArtLayout[]).map((key) => <option key={key} value={key}>{ART_LAYOUTS[key].label}</option>)}</select></label>
            : <label>Khổ thẻ<select value={card.template} onChange={(event) => update({ template: event.target.value as ImportCandidate["template"] })}><option value="poker">Poker · 745 × 1040 (Hero, Item, Magic, Modifier, Challenge)</option><option value="tarot">Tarot · 827 × 1417 (Leader, Monster)</option></select></label>}
          <div className="aw-rotate"><span>Xoay</span><button type="button" onClick={() => rotate(-90)} aria-label="Xoay trái 90°">⟲</button><output>{card.rotation}°</output><button type="button" onClick={() => rotate(90)} aria-label="Xoay phải 90°">⟳</button></div>
          <div className="aw-crop-fields">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key === "width" ? "rộng" : key === "height" ? "cao" : key}<input type="number" min={key === "width" || key === "height" ? 1 : 0} step="1" value={card.crop[key]} onChange={(event) => update({ crop: { ...card.crop, [key]: Math.round(Number(event.target.value)) } })} /></label>)}</div>
          <small>Pixel ảnh gốc (trước khi xoay). Gõ số để chỉnh chính xác từng pixel.</small>
          {!!ratioWarn && target && source && <p className="aw-warn" role="status">Tỉ lệ vùng cắt lệch {Math.round(ratioWarn * 100)}% so với {card.assetType === "artwork" ? "khung tranh" : "khổ thẻ"} {target.width}×{target.height}: {card.assetType === "artwork" ? "ảnh xuất sẽ bị cắt bớt mép để lấp đầy khung." : "ảnh xuất sẽ có viền đệm tối."} <button type="button" onClick={() => update({ crop: fitAspect(card.crop, sourceAspect(target, card.rotation), source) })}>Khớp tỉ lệ</button></p>}
          {!demo && <div className="aw-region-tools">
            <button type="button" disabled={!adapter?.detectContent} onClick={() => snapToContent([card])} title="Thu vùng sát mép thẻ/nội dung, bỏ nền thừa xung quanh">⇲ Bắt sát mép</button>
            <button type="button" onClick={removeRegion}>Xóa vùng</button>
          </div>}
          {!demo && <details className="aw-grid"><summary>Chia vùng đang chọn thành lưới</summary>
            <p>Vẽ một vùng bao cả cụm thẻ (vd. cả trang 2×2), rồi chia đều. Khe = khoảng cách giữa các thẻ, pixel ảnh gốc.</p>
            <div className="aw-crop-fields">
              <label>Hàng<input type="number" min={1} max={12} value={grid.rows} onChange={(e) => setGrid({ ...grid, rows: Math.max(1, Math.round(Number(e.target.value))) })} /></label>
              <label>Cột<input type="number" min={1} max={12} value={grid.cols} onChange={(e) => setGrid({ ...grid, cols: Math.max(1, Math.round(Number(e.target.value))) })} /></label>
              <label>Khe ngang<input type="number" min={0} value={grid.gutterX} onChange={(e) => setGrid({ ...grid, gutterX: Math.max(0, Math.round(Number(e.target.value))) })} /></label>
              <label>Khe dọc<input type="number" min={0} value={grid.gutterY} onChange={(e) => setGrid({ ...grid, gutterY: Math.max(0, Math.round(Number(e.target.value))) })} /></label>
            </div>
            <label className="aw-check"><input type="checkbox" checked={grid.snap} onChange={(e) => setGrid({ ...grid, snap: e.target.checked })} />Bắt sát mép từng ô sau khi chia</label>
            <button type="button" onClick={applyGrid}>Chia {grid.rows} × {grid.cols} = {grid.rows * grid.cols} vùng</button>
          </details>}
          <div className="aw-live"><p>Kết quả xuất {preview?.loading ? "· đang cập nhật…" : previewFresh ? "· mới nhất" : ""}</p><ResultView card={card} url={previewUrl} loading={!!preview?.loading} error={preview?.error} demo={demo} compact /></div>
          <label className="aw-check"><input type="checkbox" checked={card.reviewed} disabled={!previewFresh} onChange={(event) => update({ reviewed: event.target.checked })} />Đã kiểm tra đủ chữ, mép và chiều</label>
          {!demo && <button type="button" className="aw-primary-soft" disabled={!previewFresh || card.excluded} onClick={reviewAndNext}>✓ Duyệt & sang vùng kế →</button>}
        </>}

        {step === 2 && <>
          <div className="aw-field"><span className="aw-field-label">Thẻ trong game</span>
            <CardPicker key={card.candidateId} cards={catalogCards} value={card.definitionId} usedBy={usedBy}
              suggestedKind={card.assetType === "artwork" ? (layoutOf(card) === "party_leader" ? "party_leader" : layoutOf(card) === "monster" ? "monster" : layoutOf(card) === "hero" ? "all" : layoutOf(card)) : card.template === "tarot" ? "monster" : "all"}
              onChange={(definitionId) => { const kind = definitionId ? cardById.get(definitionId)?.kind : undefined; update({ definitionId, ...(kind ? { template: ["party_leader", "monster"].includes(kind) ? "tarot" : "poker" } : {}) }); }} />
            <p className="aw-hint">Gán vùng ảnh này cho một thẻ có trong game để game biết hiện ảnh cho thẻ nào. Catalog chỉ gồm base: thẻ expansion để “Chưa gán”, đừng gán nhầm vào thẻ base.{card.assetType === "artwork" && " Artwork bắt buộc gán thẻ: khung + chữ được vẽ từ dữ liệu của thẻ đó."}</p>
          </div>
          <div className="aw-field"><span className="aw-field-label">Variant — phiên bản ảnh</span>
            <div className="aw-variant" role="radiogroup" aria-label="Variant">
              <button type="button" role="radio" aria-checked={card.variant === "default"} onClick={() => update({ variant: "default" })}>default<small>Ảnh chính — game hiển thị</small></button>
              <button type="button" role="radio" aria-checked={card.variant !== "default"} onClick={() => card.variant === "default" && update({ variant: "alternate" })}>Bản khác<small>Lưu kèm, chưa hiển thị</small></button>
            </div>
            {card.variant !== "default" && <label>Tên bản khác<input value={card.variant} onChange={(event) => update({ variant: event.target.value.replace(/[^\w.-]/g, "-") })} placeholder="vd: alternate, kickstarter, fan-art-2" /></label>}
            <p className="aw-hint">Một thẻ có thể có nhiều ảnh (vd. bản gốc và bản Kickstarter “alternate”). Mỗi thẻ chỉ được có <b>một</b> ảnh “default” — đó là ảnh game dùng. Ảnh thứ hai cho cùng thẻ hãy đặt “Bản khác” với tên riêng; nó được lưu trong pack nhưng game chưa có chỗ chọn để hiện.</p>
          </div>
          <label>Ghi chú nguồn ảnh (provenance)<textarea rows={2} value={card.provenance.origin} onChange={(event) => update({ provenance: { ...card.provenance, origin: event.target.value } })} /></label>
          <p className="aw-hint">Ghi ảnh lấy từ đâu (file, bộ thẻ, người vẽ fan-art). Được lưu vào manifest để tra và gỡ nhanh khi có yêu cầu bản quyền. Tự điền sẵn theo tên file.</p>
          <p>Rights: <b>{card.provenance.rightsStatus}</b> · DMCA: {TAKEDOWN_CONTACT}</p>
        </>}

        {step === 3 && <><label>Chế độ xuất<select value={mode} onChange={(event) => setMode(event.target.value as ExportMode)}><option value="preview">Preview pack — cho phép chưa gán thẻ</option><option value="mapped">Webgame pack — bắt buộc gán thẻ hợp lệ</option></select></label><p>{included.length} vùng · {issues.length} mục cần xử lý</p><ul className="aw-issues">{issues.map((issue, index) => <li key={`${issue.candidateId}-${index}`}><button onClick={() => setSelected(issue.candidateId)}>{issue.candidateId}</button>{issue.message}</li>)}</ul>{!issues.length && <p>Draft đã qua kiểm tra đầu vào. Adapter vẫn kiểm tra lại từng PNG và ZIP đầu ra.</p>}<p className="aw-hint">Nguyên mặt thẻ → PNG đúng khổ thẻ, game hiển thị nguyên ảnh. Artwork → PNG đúng khung tranh, game tự vẽ khung + chữ quanh nó.</p></>}
        <label className="aw-check"><input type="checkbox" checked={card.excluded} onChange={(event) => update({ excluded: event.target.checked })} />Loại vùng này khỏi batch xuất</label>
      </fieldset>}</aside>
    </div>

    <footer className="aw-footer"><div><b>{demo ? "Demo · chưa xuất asset" : "Draft local"}</b><small>{!adapter ? "Chờ nối AssetImportAdapter." : demo ? "Chọn folder thật để import; demo không được xuất như asset thật." : issues.length ? `${issues.length} vấn đề cần xử lý trước khi xuất.` : "Sẵn sàng xuất và kiểm tra PNG."}</small>{progress && <progress max={progress.total} value={progress.done} aria-label="Tiến độ xuất">{progress.done}/{progress.total}</progress>}{progress && <small>{progress.done}/{progress.total} · {progress.label}</small>}</div><div>{busy && <button onClick={() => operation.current?.abort()}>Hủy thao tác</button>}<button disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>← Trước</button>{step < 3 ? <button className="aw-primary" onClick={() => setStep(step + 1)}>Tiếp theo →</button> : <button className="aw-primary" disabled={!adapter || demo || busy || issues.length > 0} onClick={doExport}>Xuất PNG + manifest + ZIP</button>}</div></footer>
    {notice && <p className="aw-notice" role="status">{notice}</p>}{result && <p className="aw-notice" role="status">Đã xuất và kiểm tra {result.files.length} PNG. <a href={result.archiveUrl} download={`${draft.collection.replace(/[^\w.-]+/g, "-") || "cards"}-${mode}.zip`}>Tải ZIP</a> · <a href={result.manifestUrl} download="manifest.json">Manifest</a> · Giải nén vào <code>assets/cards/packs/&lt;tên-pack&gt;/</code> rồi khởi động lại dev server.</p>}
  </main>;
}

/** Two clearly different modes, each with a diagram of what is cut and what the game draws. */
function AssetTypePicker({ value, onChange }: { value: ImportCandidate["assetType"]; onChange(next: ImportCandidate["assetType"]): void }) {
  return <div className="aw-type" role="radiogroup" aria-label="Loại asset">
    <button type="button" role="radio" aria-checked={value === "complete_card_front"} onClick={() => onChange("complete_card_front")}>
      <svg viewBox="0 0 60 84" aria-hidden><rect x="2" y="2" width="56" height="80" rx="5" className="t-cut" /><rect x="8" y="8" width="44" height="10" rx="2" className="t-ink" /><rect x="8" y="22" width="44" height="34" rx="2" className="t-art" /><rect x="8" y="60" width="44" height="16" rx="2" className="t-ink" /></svg>
      <span><b>Nguyên mặt thẻ</b><small>Cắt <u>cả lá thẻ</u> (tên, khung, chữ in sẵn). Game hiện nguyên ảnh, không vẽ thêm gì.</small></span>
    </button>
    <button type="button" role="radio" aria-checked={value === "artwork"} onClick={() => onChange("artwork")}>
      <svg viewBox="0 0 60 84" aria-hidden><rect x="2" y="2" width="56" height="80" rx="5" className="t-frame" /><rect x="8" y="8" width="44" height="10" rx="2" className="t-gen" /><rect x="8" y="22" width="44" height="34" rx="2" className="t-art t-cut" /><rect x="8" y="60" width="44" height="16" rx="2" className="t-gen" /></svg>
      <span><b>Artwork riêng</b><small>Chỉ cắt <u>phần tranh</u>. Game tự vẽ khung, tên, chữ từ dữ liệu thẻ — cần gán thẻ ở bước 3.</small></span>
    </button>
  </div>;
}

/** What the export produces, and for artwork, how it sits on the real card. */
function ResultView({ card, url, loading, error, demo, compact = false }: { card?: ImportCandidate; url?: string; loading: boolean; error?: string; demo: boolean; compact?: boolean }) {
  if (!card) return <div className="aw-preview"><p>Chưa chọn vùng.</p></div>;
  if (error) return <div className="aw-preview"><p role="alert">Lỗi render: {error}</p></div>;
  if (!url) return <div className={`aw-preview ${compact ? "compact" : ""}`}><p>{loading ? "Đang render…" : demo ? "Demo không có preview." : "Chưa có preview."}</p></div>;
  if (card.assetType !== "artwork") {
    const size = CARD_SIZE[card.template];
    return <div className={`aw-preview ${compact ? "compact" : ""} ${loading ? "stale" : ""}`}><figure><img src={url} alt={`Mặt thẻ xuất ${card.label}`} /><figcaption>PNG {size.width} × {size.height} · hiển thị nguyên ảnh</figcaption></figure></div>;
  }
  const layout = layoutOf(card);
  const mapped = card.definitionId ? cardById.get(card.definitionId) : undefined;
  const sample = mapped ?? sampleCardFor(layout);
  return <div className={`aw-preview aw-preview-pair ${compact ? "compact" : ""} ${loading ? "stale" : ""}`}>
    <figure><img src={url} alt={`Artwork xuất ${card.label}`} /><figcaption>PNG khung tranh {ART_LAYOUTS[layout].width} × {ART_LAYOUTS[layout].height}</figcaption></figure>
    {sample && <figure className="aw-on-card"><CardRenderer card={sample} artUrl={url} /><figcaption>{mapped ? `Trên thẻ ${mapped.name}` : `Ví dụ trên thẻ ${sample.name} (chưa gán)`}</figcaption></figure>}
  </div>;
}
