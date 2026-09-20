import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.js";
import "./styles.css";

// Theme follows the OS. Stored explicitly once the user picks one, but there is no toggle yet —
// the app is dark-first because most of its users arrive from a wallet extension at night.
const saved = localStorage.getItem("cookie-oven:theme");
if (saved === "light" || saved === "dark") {
  document.documentElement.dataset.theme = saved;
} else if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
  document.documentElement.dataset.theme = "light";
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
