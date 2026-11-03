import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./lobby.css";
import { App } from "./App";
import { CardGallery } from "./cards/CardGallery";
import { AssetImportWorkbench } from "./asset-import/AssetImportWorkbench";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("asset-import") ? <AssetImportWorkbench /> : new URLSearchParams(location.search).has("cards") ? <CardGallery /> : <App />}
  </StrictMode>,
);
