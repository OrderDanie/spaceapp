import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initLiquidGlass, initRimLight } from "./lib/liquidGlass";

initLiquidGlass();
initRimLight();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
