import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

function showError(text: string) {
  const el = document.getElementById("dsh-error");
  if (!el) return;
  el.style.display = "block";
  el.textContent = text;
}

window.addEventListener("error", (e) => {
  showError(`错误：${e.message} @ ${(e as ErrorEvent).filename}:${(e as ErrorEvent).lineno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  showError(`未处理的 Promise 拒绝：${r instanceof Error ? r.message : String(r)}`);
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);