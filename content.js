(function () {
  const FAB_ID = "form-fab";
  const MOUNT_ID = "form-fab-mount";
  const ICON_URL = chrome.runtime.getURL("icons/fab-icon.png");

  let ensureScheduled = false;
  let profileAnchor = null;

  function detectHost() {
    const path = location.pathname || "";
    if (location.hostname === "forms.google.com") return "forms";
    if (location.hostname === "slides.google.com") return "slides";
    if (location.hostname === "sheets.google.com") return "sheets";
    if (location.hostname === "docs.google.com") {
      if (/\/forms\//i.test(path)) return "forms";
      if (path.includes("/document/")) return "docs";
      if (path.includes("/presentation/")) return "slides";
      if (path.includes("/spreadsheets/")) return "sheets";
    }
    return "unknown";
  }

  function detectFormId() {
    const m = location.href.match(/\/forms\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/i);
    return m ? m[1] : "";
  }

  function detectFileId() {
    const host = detectHost();
    if (host !== "docs" && host !== "slides" && host !== "sheets") return "";
    const m = location.href.match(/\/(?:document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/i);
    return m ? m[1] : "";
  }

  function pageTitle() {
    return (document.title || "")
      .replace(/\s*[-–—]\s*Google\s+Forms.*$/i, "")
      .replace(/\s*[-–—]\s*Google\s+Docs.*$/i, "")
      .replace(/\s*[-–—]\s*Google\s+Slides.*$/i, "")
      .replace(/\s*[-–—]\s*Google\s+Sheets.*$/i, "")
      .trim();
  }

  function pickText(el) {
    if (!el) return "";
    const text = el.innerText || el.textContent || "";
    return text.replace(/\s+/g, " ").trim();
  }

  function longestText(selectors) {
    let best = "";
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const t = pickText(el);
        if (t.length > best.length) best = t;
      });
    }
    return best;
  }

  async function extractDocumentText() {
    const host = detectHost();

    if (host === "forms") {
      const title = document.querySelector(".freebirdFormviewerViewHeaderTitle")?.innerText || "";
      const desc = document.querySelector(".freebirdFormviewerViewHeaderDescription")?.innerText || "";
      const questions = [];
      document.querySelectorAll(".freebirdFormviewerViewQuestionContent").forEach((q) => {
        questions.push(pickText(q));
      });
      return { text: `${title}\n${desc}\n\n${questions.join("\n\n")}`, source: "forms" };
    }

    if (host === "docs") {
      const fromEditor = longestText([
        ".kix-appview-editor",
        ".docs-editor-container",
        ".kix-paginateddocumentplugin",
        "#workspace-container",
        ".kix-canvas-tile-content",
        '[role="document"]',
      ]);
      if (fromEditor.length > 80) return { text: fromEditor, source: "docs-editor" };

      const chunks = [];
      document.querySelectorAll(
        ".kix-lineview-text-block, .kix-paragraphrenderer, [role='paragraph'], .kix-lineview"
      ).forEach((el) => {
        const t = pickText(el);
        if (t) chunks.push(t);
      });
      if (chunks.length) return { text: chunks.join("\n"), source: "docs-chunks" };

      return { text: fromEditor, source: "docs-fallback" };
    }

    if (host === "slides") {
      const slideSelectors = [
        ".punch-viewer-content",
        ".punch-viewer-svgpage",
        ".punch-viewer-slide-content",
        '[role="main"]',
      ];
      for (const sel of slideSelectors) {
        const t = pickText(document.querySelector(sel));
        if (t.length > 30) return { text: t, source: "slides" };
      }
    }

    if (host === "sheets") {
      const rows = [];
      document.querySelectorAll('[role="grid"] [role="row"]').forEach((row) => {
        const cells = [];
        row.querySelectorAll('[role="gridcell"]').forEach((cell) => {
          const t = pickText(cell);
          if (t) cells.push(t);
        });
        if (cells.length) rows.push(cells.join("\t"));
      });
      if (rows.length) return { text: rows.join("\n"), source: "sheets-grid" };

      const fallback = longestText([
        "#waffle-grid-container",
        ".grid-container",
        '[role="grid"]',
      ]);
      if (fallback.length > 20) return { text: fallback, source: "sheets-fallback" };
    }

    return { text: "", source: "none" };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "GET_PAGE_TEXT") {
      void extractDocumentText().then(({ text, source }) => {
        sendResponse({
          text: text || "",
          title: pageTitle(),
          host: detectHost(),
          source: source || "none",
        });
      });
      return true;
    }
    return false;
  });

  function pushContext() {
    chrome.runtime.sendMessage({
      type: "SET_CONTEXT",
      host: detectHost(),
      pageUrl: location.href,
      pageTitle: pageTitle(),
      formId: detectFormId(),
      fileId: detectFileId(),
    });
  }

  function forEachElement(root, fn) {
    if (!root) return;
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (node.nodeType !== 1) continue;
      fn(node);
      if (node.shadowRoot) stack.push(node.shadowRoot);
      const children = node.children;
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }

  function queryDeep(selector) {
    const hits = [];
    forEachElement(document.documentElement, (el) => {
      if (el.matches?.(selector)) hits.push(el);
    });
    return hits;
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function findProfileControl() {
    const selectors = [
      '[aria-label*="Google Account"]',
      '[aria-label*="Google account"]',
      '[data-tooltip*="Google Account"]',
      'a[href*="accounts.google.com/SignOutOptions"]',
      'a[href*="accounts.google.com"][aria-label]',
    ];
    for (const sel of selectors) {
      for (const el of queryDeep(sel)) {
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top > 140 || r.right < window.innerWidth * 0.55) continue;
        return el.closest('a, button, [role="button"]') || el;
      }
    }

    const photoHits = [];
    forEachElement(document.documentElement, (el) => {
      if (el.tagName !== "IMG") return;
      const src = el.getAttribute("src") || "";
      if (!/googleusercontent\.com|ggpht\.com/i.test(src)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 18 || r.width > 52 || r.height < 18) return;
      if (r.top > 120 || r.right < window.innerWidth - 220) return;
      const control = el.closest('a, button, [role="button"]') || el.parentElement;
      if (control && isVisible(control)) photoHits.push({ control, right: r.right });
    });
    if (photoHits.length) {
      photoHits.sort((a, b) => b.right - a.right);
      return photoHits[0].control;
    }

    return null;
  }

  function findInsertParent(profileEl) {
    let node = profileEl;
    for (let i = 0; i < 8 && node; i++) {
      const parent = node.parentElement;
      if (!parent) break;
      const style = window.getComputedStyle(parent);
      const kids = [...parent.children].filter(isVisible);
      if (
        (style.display === "flex" || style.display === "inline-flex") &&
        kids.length >= 2
      ) {
        return { parent, before: node };
      }
      node = parent;
    }
    return { parent: profileEl.parentElement, before: profileEl };
  }

  function createFab() {
    let btn = document.getElementById(FAB_ID);
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = FAB_ID;
    btn.type = "button";
    btn.title = "Local AI Form Builder";
    btn.setAttribute("aria-label", "Open Local AI Form Builder");

    const img = document.createElement("img");
    img.src = ICON_URL;
    img.alt = "";
    img.width = 28;
    img.height = 28;
    img.draggable = false;
    btn.appendChild(img);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = {
        type: "OPEN_PANEL",
        host: detectHost(),
        pageUrl: location.href,
        pageTitle: pageTitle(),
        formId: detectFormId(),
        fileId: detectFileId(),
      };
      try {
        const port = chrome.runtime.connect({ name: "form-open-panel" });
        port.postMessage(payload);
        port.disconnect();
      } catch {
        chrome.runtime.sendMessage(payload);
      }
    });
    return btn;
  }

  function positionAnchored(mount, profileEl) {
    const rect = profileEl.getBoundingClientRect();
    const size = 36;
    mount.className = "form-fab-mount form-fab-mount--anchored";
    mount.style.top = `${Math.round(rect.top + (rect.height - size) / 2)}px`;
    mount.style.left = `${Math.round(rect.left - size - 8)}px`;
    document.documentElement.appendChild(mount);
  }

  function ensureFab() {
    ensureScheduled = false;
    const btn = createFab();
    let mount = document.getElementById(MOUNT_ID);
    if (!mount) {
      mount = document.createElement("div");
      mount.id = MOUNT_ID;
    }

    const profile = findProfileControl();
    profileAnchor = profile;

    if (profile) {
      const slot = findInsertParent(profile);
      mount.className = "form-fab-mount";
      if (!mount.contains(btn)) mount.appendChild(btn);

      if (slot.parent && slot.before) {
        try {
          if (mount.parentElement !== slot.parent) {
            slot.parent.insertBefore(mount, slot.before);
          } else if (mount.nextElementSibling !== slot.before) {
            slot.parent.insertBefore(mount, slot.before);
          }
          mount.className = "form-fab-mount";
          mount.style.top = "";
          mount.style.left = "";
          mount.style.right = "";
          return;
        } catch {
          /* fall through to anchored positioning */
        }
      }
    }

    if (profile) {
      positionAnchored(mount, profile);
    } else {
      mount.className = "form-fab-mount form-fab-mount--fallback";
      if (!document.documentElement.contains(mount)) {
        document.documentElement.appendChild(mount);
      }
      if (!mount.contains(btn)) mount.appendChild(btn);
    }
    btn.classList.add("form-fab--anchored");
  }

  function scheduleEnsureFab() {
    if (ensureScheduled) return;
    ensureScheduled = true;
    requestAnimationFrame(ensureFab);
  }

  function repositionIfAnchored() {
    if (!profileAnchor) return;
    const mount = document.getElementById(MOUNT_ID);
    if (!mount?.classList.contains("form-fab-mount--anchored")) return;
    if (!document.body.contains(profileAnchor)) {
      profileAnchor = findProfileControl();
    }
    if (profileAnchor) positionAnchored(mount, profileAnchor);
  }

  pushContext();
  ensureFab();

  const domObs = new MutationObserver(scheduleEnsureFab);
  domObs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("resize", repositionIfAnchored);
  window.addEventListener("scroll", repositionIfAnchored, true);

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      pushContext();
      scheduleEnsureFab();
    }
    repositionIfAnchored();
  }, 500);

  for (const delay of [400, 1000, 2000, 4000, 8000, 15000]) {
    setTimeout(scheduleEnsureFab, delay);
  }

  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(() => pushContext()).observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  window.addEventListener("popstate", () => {
    pushContext();
    scheduleEnsureFab();
  });
  window.addEventListener("hashchange", () => {
    pushContext();
    scheduleEnsureFab();
  });
})();