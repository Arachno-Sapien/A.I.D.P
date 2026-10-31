import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// After App.css (imported by App), so theme effects win over the defaults.
import "./themes.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
