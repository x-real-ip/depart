import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

const wortel = document.getElementById("root");
if (wortel === null) throw new Error("Element #root ontbreekt in index.html");

createRoot(wortel).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
