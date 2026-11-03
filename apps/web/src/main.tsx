import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./lobby.css";
import { App } from "./App";
import { CardGallery } from "./cards/CardGallery";
import { AssetImportWorkbench } from "./asset-import/AssetImportWorkbench";
import { createBrowserAdapter } from "./asset-import/adapters/browserAdapter";

// Composition root: one adapter instance for the page lifetime (dev route only).
const assetAdapter = new URLSearchParams(location.search).has("asset-import") ? createBrowserAdapter() : undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("asset-import") ? <AssetImportWorkbench adapter={assetAdapter} /> : new URLSearchParams(location.search).has("cards") ? <CardGallery /> : <App />}
  </StrictMode>,
);
