import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./lobby.css";
import { App } from "./App";
import { CardGallery } from "./cards/CardGallery";
import { LanguageProvider, LanguageSwitch } from "./i18n";

const params = new URLSearchParams(location.search);
// Dev-only route: the workbench and its Kickstarter demo fixtures (rights FAN_MADE_NON_COMMERCIAL, ADR-004)
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
    <LanguageProvider>
      <LanguageSwitch />
      {AssetImportRoute ? <Suspense fallback={null}><AssetImportRoute /></Suspense> : params.has("cards") ? <CardGallery /> : <App />}
    </LanguageProvider>
  </StrictMode>,
);
