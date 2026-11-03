import { useRef } from "react";
import { CardById } from "./CardRenderer";
import { cardById } from "./catalog";

export function CardPreview({ definitionId, name }: { definitionId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button className="card-preview-button" type="button" aria-label={`Inspect ${name}`} onClick={() => dialog.current?.showModal()}><CardById definitionId={definitionId} fallback={name} /></button>
    <dialog className="card-dialog" ref={dialog} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="card-dialog-heading"><b>{name}</b><button type="button" onClick={() => dialog.current?.close()} aria-label="Close card">×</button></div>
      <CardById definitionId={definitionId} fallback={name} />
      <p>{cardById.get(definitionId)?.text}</p>
    </dialog>
  </>;
}
