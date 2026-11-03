import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./lobby.css";
import { App } from "./App";
import { CardGallery } from "./cards/CardGallery";

const params = new URLSearchParams(location.search);
// Dev-only route: the workbench and its Kickstarter demo fixtures (rights UNVERIFIED, ADR-003)
// must not be bundled into production. `import.meta.env.DEV` is false at build time, so the
// dynamic import below is dead code and its chunk + images are never emitted.
const AssetImportRoute = import.meta.env.DEV && params.has("asset-import")
  ? lazy(async () => {
    const [{ AssetImportWorkbench }, { createBrowserAdapter }, { cardById }] = await Promise.all([
      import("./asset-import/AssetImportWorkbench"),
      import("./asset-import/adapters/browser"),
      import("./cards/catalog"),
    ]);
    // One adapter for the page lifetime (composition root); dispose() only releases resources.
    const adapter = createBrowserAdapter({ definitions: cardById });
    return { default: () => <AssetImportWorkbench adapter={adapter} /> };
  })
  : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {AssetImportRoute ? <Suspense fallback={null}><AssetImportRoute /></Suspense> : params.has("cards") ? <CardGallery /> : <App />}
  </StrictMode>,
);
