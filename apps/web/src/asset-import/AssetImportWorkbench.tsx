import { useEffect, useRef, useState } from "react";
import { cardById } from "../cards/catalog";
import spec from "../../../../docs/contracts/CARD_TEMPLATE_SPEC.json";
import { createDemoDraft } from "./fixtures";
import { validateDraft, type AssetImportAdapter, type ExportMode, type ExportResult, type ImportCandidate, type ImportDraft, type QuarterTurn } from "./contract";
import "./workbench.css";

const steps = ["Nguồn ảnh", "Crop & chiều", "Mapping", "Kiểm tra & xuất"];
/** Working UI shell; importer I/O belongs to the supplied adapter, not gameplay. */
export function AssetImportWorkbench({ adapter }: { adapter?: AssetImportAdapter }) {
  const [draft, setDraft] = useState<ImportDraft>(createDemoDraft);
  const [selected, setSelected] = useState("demo-hoodwink");
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<ExportMode>("preview");
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ExportResult | null>(null);
  const [demo, setDemo] = useState(true);
  const chooser = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => { operation.current?.abort(); adapter?.dispose(); }, [adapter]);
  const card = draft.candidates.find((candidate) => candidate.candidateId === selected);
  const source = draft.sources.find((entry) => entry.sourceId === card?.sourceId);
  const issues = validateDraft(draft, mode, cardById);
  const cardIssues = issues.filter((issue) => issue.candidateId === selected);
  const included = draft.candidates.filter((entry) => !entry.excluded);
  const outputSize = card ? spec.cardSizes[card.template] : null;

  const update = (patch: Partial<ImportCandidate>, needsPreview = false) => {
    if (!card) return;
    setResult(null);
    setDraft((current) => ({ ...current, candidates: current.candidates.map((entry) => entry.candidateId === selected ? { ...entry, ...patch, ...(needsPreview ? { reviewed: false } : {}) } : entry) }));
    if (needsPreview) setDirty((current) => new Set([...current, selected]));
  };
  async function run(task: (signal: AbortSignal) => Promise<void>) {
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setNotice("");
    try { await task(controller.signal); }
    catch (error) { setNotice(controller.signal.aborted ? "Đã hủy thao tác. Draft vẫn được giữ." : `Lỗi: ${error instanceof Error ? error.message : String(error)}`); }
    finally { if (operation.current === controller) setBusy(false); }
  }
  const loadFiles = (files: File[]) => {
    if (!adapter || !files.length) return;
    void run(async (signal) => {
      const next = await adapter.inspect(files, signal);
      if (signal.aborted) return;
      setDraft(next); setSelected(next.candidates[0]?.candidateId ?? ""); setDirty(new Set()); setDemo(false); setResult(null); setStep(1);
    });
  };
  const refreshPreview = () => {
    if (!adapter || demo || !source || !card) return;
    void run(async (signal) => {
      const previewUrl = await adapter.preview(source, card, signal);
      if (signal.aborted) return;
      update({ previewUrl, reviewed: false });
      setDirty((current) => { const next = new Set(current); next.delete(card.candidateId); return next; });
    });
  };
  const saveDraft = () => {
    const blob = new Blob([JSON.stringify({ ...draft, candidates: draft.candidates.map(({ previewUrl: _url, ...candidate }) => candidate) }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "card-import-draft.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Đã tải draft JSON. Đây là kế hoạch import, chưa phải bộ PNG.");
  };
  return <main className="asset-workbench">
    <header className="aw-header"><a href="/?cards">← COLLECTION</a><strong>HERE TO SLAY <span>/ ASSET WORKBENCH</span></strong><span className="aw-badge">{demo ? "UI DEMO" : "LOCAL IMPORT"}</span></header>
    <section className="aw-title"><div><p className="aw-eyebrow">CARD ASSET PIPELINE</p><h1>Một nguồn ảnh.<br /><em>Một bộ thẻ nhất quán.</em></h1></div><p>Chọn nguồn, duyệt từng mặt thẻ, gán ID và xuất đúng khổ webgame. Import ảnh không thay đổi luật hoặc bật expansion.</p></section>
    <div className="aw-banner" role="status">{demo ? "Đang xem 3 thẻ demo từ bộ Kickstarter. File nguồn chưa được import hoặc hash trong workbench này." : "Draft chỉ nằm trong phiên hiện tại. Tải draft JSON trước khi đóng trang."}{!adapter && " Adapter import/export chưa nối; chọn folder và xuất PNG đang khóa."}</div>
    <nav className="aw-steps" aria-label="Các bước import">{steps.map((label, index) => <button key={label} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span>0{index + 1}</span>{label}</button>)}</nav>
    <div className="aw-toolbar"><input ref={chooser} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" {...{ webkitdirectory: "" }} onChange={(event) => { loadFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /><button disabled={!adapter || busy} onClick={() => chooser.current?.click()}>＋ Chọn folder ảnh</button><button disabled={busy} onClick={() => { setDraft(createDemoDraft()); setSelected("demo-hoodwink"); setDirty(new Set()); setDemo(true); setResult(null); setNotice(""); }}>Nạp lại demo</button><button onClick={saveDraft}>Tải draft JSON</button><span>{draft.sources.length} nguồn · {included.length}/{draft.candidates.length} mặt được chọn</span></div>
    <div className="aw-layout">
      <aside className="aw-panel aw-sources"><h2>01 / Nguồn & mặt thẻ</h2>{draft.sources.map((entry) => <section key={entry.sourceId}><p className="aw-source-name">{entry.relativePath}</p><small>{entry.width} × {entry.height} · {entry.sha256 ? "SHA-256 có sẵn" : "Chưa hash"}</small>{draft.candidates.filter((candidate) => candidate.sourceId === entry.sourceId).map((candidate) => <button className={`aw-candidate ${selected === candidate.candidateId ? "selected" : ""}`} key={candidate.candidateId} aria-pressed={selected === candidate.candidateId} onClick={() => { setSelected(candidate.candidateId); setNotice(""); }}><span>{candidate.label}</span><small>{candidate.excluded ? "Đã loại" : candidate.reviewed ? "Đã duyệt crop" : "Chờ duyệt"} · {candidate.template}</small></button>)}</section>)}{!draft.sources.length && <p>Chưa có ảnh nguồn. Chọn folder để bắt đầu.</p>}</aside>
      <section className="aw-panel aw-canvas"><div className="aw-panel-heading"><h2>{card?.label ?? "Chưa chọn thẻ"}</h2><span>{card?.assetType === "artwork" ? "ARTWORK" : "COMPLETE FACE"}</span></div><div className="aw-preview">{card?.previewUrl ? <img src={card.previewUrl} alt={`Preview ${card.label}`} /> : <p>Chưa có preview.</p>}</div><p className="aw-preview-caption">{dirty.has(selected) ? "Draft đã đổi. Preview hiện tại chưa phản ánh thay đổi — cần áp dụng crop qua adapter." : "Preview nguồn đã cắt; kiểm tra chữ, mép thẻ và chiều xoay."}</p><div className="aw-size"><span>OUTPUT CANVAS</span><strong>{outputSize ? `${outputSize.width} × ${outputSize.height}` : "—"}<small> px · PNG / contain</small></strong></div></section>
      <aside className="aw-panel aw-inspector"><h2>{steps[step]}</h2>{card && <fieldset disabled={busy}>
        {step === 0 && <><p>Đọc PNG/JPEG/WebP từ folder được chọn. Sheet nhiều thẻ cần đề xuất vùng cắt và duyệt thủ công.</p><label>Tên bộ ảnh<input value={draft.collection} onChange={(event) => setDraft({ ...draft, collection: event.target.value })} /></label><dl><dt>Đường dẫn tương đối</dt><dd>{source?.relativePath}</dd><dt>Hash nguồn</dt><dd>{source?.sha256 ?? "Chưa tính — demo không đủ điều kiện xuất"}</dd></dl></>}
        {(step === 1 || step === 2) && <><label>Loại asset<select value={card.assetType} onChange={(event) => update({ assetType: event.target.value as ImportCandidate["assetType"] }, true)}><option value="complete_card_front">Nguyên mặt thẻ — dùng trực tiếp</option><option value="artwork">Artwork riêng — ghép CardRenderer</option></select></label><label>Mặt<select value={card.side} onChange={(event) => update({ side: event.target.value as "front" | "back" })}><option value="front">Front</option><option value="back">Back — phải loại khỏi batch</option></select></label></>}
        {step === 1 && <><label>Khổ template<select value={card.template} onChange={(event) => update({ template: event.target.value as ImportCandidate["template"] }, true)}><option value="poker">Poker · 745 × 1040</option><option value="tarot">Tarot · 827 × 1417</option></select></label><div className="aw-crop-fields">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key}<input type="number" min={key === "width" || key === "height" ? 1 : 0} step="1" value={card.crop[key]} onChange={(event) => update({ crop: { ...card.crop, [key]: Number(event.target.value) } }, true)} /></label>)}</div><small>Pixel nguồn trước khi xoay. Góc xoay theo chiều kim đồng hồ.</small><label>Xoay<select value={card.rotation} onChange={(event) => update({ rotation: Number(event.target.value) as QuarterTurn }, true)}>{[0, 90, 180, 270].map((angle) => <option key={angle} value={angle}>{angle}°</option>)}</select></label><button disabled={!adapter || demo || busy || cardIssues.some((issue) => issue.code === "crop_bounds")} onClick={refreshPreview}>Áp dụng & xem crop</button><label className="aw-check"><input type="checkbox" checked={card.reviewed} disabled={dirty.has(selected)} onChange={(event) => update({ reviewed: event.target.checked })} />Đã kiểm tra đủ chữ, mép và chiều</label></>}
        {step === 2 && <><label>definitionId<select value={card.definitionId ?? ""} onChange={(event) => update({ definitionId: event.target.value || null })}><option value="">Chưa mapping / chỉ preview</option>{[...cardById.values()].map((definition) => <option key={definition.definitionId} value={definition.definitionId}>{definition.name} · {definition.kind}</option>)}</select></label><p className="aw-hint">Catalog hiện có chỉ gồm base. Thẻ expansion chưa có ID tương ứng: giữ pending, không gán nhầm vào thẻ base.</p><label>Variant<input value={card.variant} onChange={(event) => update({ variant: event.target.value })} /></label><label>Nguồn / provenance<textarea rows={3} value={card.provenance.origin} onChange={(event) => update({ provenance: { ...card.provenance, origin: event.target.value } })} /></label><p>Rights: <b>UNVERIFIED</b></p></>}
        {step === 3 && <><label>Chế độ xuất<select value={mode} onChange={(event) => setMode(event.target.value as ExportMode)}><option value="preview">Preview pack — cho phép chưa mapping</option><option value="mapped">Webgame pack — bắt buộc ID hợp lệ</option></select></label><p>{included.length} mặt · {issues.length} mục cần xử lý</p><ul className="aw-issues">{issues.map((issue, index) => <li key={`${issue.candidateId}-${index}`}><button onClick={() => setSelected(issue.candidateId)}>{issue.candidateId}</button>{issue.message}</li>)}</ul>{!issues.length && <p>Draft đã qua kiểm tra đầu vào. Adapter vẫn phải kiểm tra PNG đầu ra.</p>}<p className="aw-hint">Ảnh nguyên mặt không chồng thêm khung/chữ. Artwork riêng phải qua bước composite theo template.</p></>}
        <label className="aw-check"><input type="checkbox" checked={card.excluded} onChange={(event) => update({ excluded: event.target.checked })} />Loại mặt này khỏi batch xuất</label>
      </fieldset>}</aside>
    </div>
    <footer className="aw-footer"><div><b>{demo ? "Demo · chưa xuất asset" : "Draft local"}</b><small>{!adapter ? "Chờ Claude nối AssetImportAdapter." : demo ? "Chọn folder thật để import; demo không được xuất như asset thật." : issues.length ? `${issues.length} vấn đề cần xử lý trước khi xuất.` : "Sẵn sàng yêu cầu adapter xuất và kiểm tra PNG."}</small></div><div>{busy && <button onClick={() => operation.current?.abort()}>Hủy thao tác</button>}<button disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>← Trước</button>{step < 3 ? <button className="aw-primary" onClick={() => setStep(step + 1)}>Tiếp theo →</button> : <button className="aw-primary" disabled={!adapter || demo || busy || issues.length > 0} onClick={() => { if (adapter) void run(async (signal) => { const exported = await adapter.export(draft, mode, signal); if (!signal.aborted) setResult(exported); }); }}>Xuất PNG + manifest + ZIP</button>}</div></footer>
    {notice && <p className="aw-notice" role="status">{notice}</p>}{result && <p className="aw-notice" role="status">Đã xuất {result.files.length} file. <a href={result.archiveUrl} download>Tải ZIP</a> · <a href={result.manifestUrl} download>Manifest</a></p>}
  </main>;
}
