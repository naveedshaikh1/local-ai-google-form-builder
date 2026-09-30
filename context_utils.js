/** Per-tab workspace context (avoids sidebar showing the wrong page). */
export function contextKey(tabId) {
  return `ctx:${tabId}`;
}

export function parseHost(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "docs.google.com") {
      if (/\/forms\//i.test(u.pathname)) return "forms";
      if (u.pathname.includes("/document/")) return "docs";
      if (u.pathname.includes("/presentation/")) return "slides";
      if (u.pathname.includes("/spreadsheets/")) return "sheets";
    }
    if (u.hostname === "slides.google.com") return "slides";
    if (u.hostname === "sheets.google.com") return "sheets";
    if (u.hostname === "forms.google.com") return "forms";
  } catch {
    /* ignore */
  }
  return "unknown";
}

export function parseFileId(url, host) {
  const s = String(url || "");
  const h = host || parseHost(s);
  if (h === "docs" || h === "slides" || h === "sheets") {
    const m = s.match(/\/(?:document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/i);
    if (m) return m[1];
  }
  return "";
}

export function parseFormId(url) {
  const s = String(url || "");
  const edit = s.match(/\/forms\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/i);
  if (edit) return edit[1];
  return "";
}

export function contextFromTab(tab) {
  const url = tab?.url || "";
  const host = parseHost(url);
  return {
    host,
    pageUrl: url,
    pageTitle: tab?.title || "",
    formId: parseFormId(url),
    fileId: parseFileId(url, host),
    updatedAt: Date.now(),
  };
}

export async function getContextForTab(tabId) {
  if (tabId == null) return {};
  const key = contextKey(tabId);
  const bag = await chrome.storage.session.get(key);
  return bag[key] || {};
}

export async function setContextForTab(tabId, ctx) {
  if (tabId == null) return;
  await chrome.storage.session.set({ [contextKey(tabId)]: { ...ctx, updatedAt: Date.now() } });
}