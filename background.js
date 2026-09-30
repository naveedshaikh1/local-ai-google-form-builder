import { GOOGLE_CLIENT_ID } from "./oauth_config.js";
import { validateLocalEndpoint, validateQuiz } from "./validation.js";
import {
  contextFromTab,
  parseFormId,
  parseFileId,
  parseHost,
  setContextForTab,
} from "./context_utils.js";

const PANEL_PATH = "sidepanel.html";
const PANEL_OPEN_TABS_KEY = "panelOpenTabIds";

async function getOpenPanelTabIds() {
  const bag = await chrome.storage.session.get(PANEL_OPEN_TABS_KEY);
  return new Set(bag[PANEL_OPEN_TABS_KEY] || []);
}

async function addOpenPanelTab(tabId) {
  const ids = await getOpenPanelTabIds();
  ids.add(tabId);
  await chrome.storage.session.set({ [PANEL_OPEN_TABS_KEY]: [...ids] });
}

async function removeOpenPanelTab(tabId) {
  const ids = await getOpenPanelTabIds();
  ids.delete(tabId);
  await chrome.storage.session.set({ [PANEL_OPEN_TABS_KEY]: [...ids] });
}

function isWorkspaceUrl(url) {
  return parseHost(url || "") !== "unknown";
}

async function exportGoogleFileInTab(tabId, fileId, host) {
  if (tabId == null || !fileId || !["docs", "slides", "sheets"].includes(host)) return "";
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["google_export_in_page.js"],
      world: "MAIN",
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async (fid, h) => {
        if (typeof window.__formExportGoogleFileText === "function") {
          return window.__formExportGoogleFileText(fid, h);
        }
        return "";
      },
      args: [fileId, host],
    });
    return results?.[0]?.result || "";
  } catch {
    return "";
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

async function syncTabPanelAvailability(tabId, tab) {
  if (!tab?.url) return;
  if (isWorkspaceUrl(tab.url)) {
    await chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true });
  } else {
    await chrome.sidePanel.setOptions({ tabId, enabled: false });
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  if (info.status === "complete" || info.url) {
    if (isWorkspaceUrl(tab.url)) {
      await syncTabPanelAvailability(tabId, tab);
      setContextForTab(tabId, { ...contextFromTab(tab), tabId });
    } else {
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
    }
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const ids = await getOpenPanelTabIds();
  if (ids.has(tabId)) chrome.runtime.sendMessage({ type: "PANEL_OPENED", tabId }).catch(() => {});
});

function openPanelNow(tabId) {
  chrome.sidePanel.open({ tabId });
}

async function openPanelForTab(tabId, windowId, contextPayload, { skipOpen = false } = {}) {
  if (contextPayload) await setContextForTab(tabId, { ...contextPayload, tabId });
  await chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true });
  await addOpenPanelTab(tabId);
  if (!skipOpen) openPanelNow(tabId);
  const notify = () => chrome.runtime.sendMessage({ type: "PANEL_OPENED", tabId }).catch(() => {});
  notify();
  setTimeout(notify, 200);
}

function handleOpenPanelFromTab(tabId, windowId, msg) {
  const payload = {
    host: msg.host || "",
    pageUrl: msg.pageUrl || "",
    pageTitle: msg.pageTitle || "",
    formId: msg.formId || "",
    fileId: msg.fileId || "",
    tabId,
  };
  chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true });
  openPanelNow(tabId);
  void openPanelForTab(tabId, windowId, payload, { skipOpen: true });
}

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id == null) return;
  handleOpenPanelFromTab(tab.id, tab.windowId, contextFromTab(tab));
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "form-open-panel") return;
  const tabId = port.sender?.tab?.id;
  const windowId = port.sender?.tab?.windowId;
  port.onMessage.addListener((msg) => {
    if (tabId != null) handleOpenPanelFromTab(tabId, windowId, msg || {});
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SET_CONTEXT") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false });
      return false;
    }
    setContextForTab(tabId, {
      host: msg.host || parseHost(sender.tab?.url || ""),
      pageUrl: msg.pageUrl || sender.tab?.url || "",
      pageTitle: msg.pageTitle || sender.tab?.title || "",
      formId: msg.formId || parseFormId(sender.tab?.url || ""),
      fileId: msg.fileId || parseFileId(msg.pageUrl || sender.tab?.url || "", msg.host || parseHost(sender.tab?.url || "")),
      tabId,
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === "OPEN_PANEL") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      handleOpenPanelFromTab(tabId, sender.tab?.windowId, {
        host: msg.host || parseHost(sender.tab?.url || ""),
        pageUrl: msg.pageUrl || sender.tab?.url || "",
        pageTitle: msg.pageTitle || sender.tab?.title || "",
        formId: msg.formId || parseFormId(sender.tab?.url || ""),
        fileId: msg.fileId || "",
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === "GET_ACTIVE_TAB_ID") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tabId: tabs[0]?.id ?? null });
    });
    return true;
  }

  if (msg?.type === "GET_PAGE_TEXT_FOR_TAB") {
    const tabId = msg.tabId;
    if (tabId == null) {
      sendResponse({ text: "", title: "" });
      return false;
    }
    void (async () => {
      let fileId = (msg.fileId || "").trim();
      let host = (msg.host || "").trim();
      if (!fileId || !host) {
        try {
          const bag = await chrome.storage.session.get(`ctx:${tabId}`);
          const ctx = bag[`ctx:${tabId}`] || {};
          fileId = fileId || ctx.fileId || "";
          host = host || ctx.host || "";
        } catch {
          /* ignore */
        }
      }
      if (fileId && ["docs", "slides", "sheets"].includes(host)) {
        const exported = await exportGoogleFileInTab(tabId, fileId, host);
        const minLen = host === "sheets" ? 20 : 80;
        if (exported && exported.length >= minLen) {
          sendResponse({ text: exported, title: "", source: "export" });
          return;
        }
      }
      chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_TEXT" }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ text: "", title: "", source: "none", error: chrome.runtime.lastError.message });
        } else {
          sendResponse(resp || { text: "", title: "", source: "none" });
        }
      });
    })();
    return true;
  }

  if (msg?.type === "EXPORT_GOOGLE_FILE_TEXT") {
    const tabId = sender.tab?.id ?? msg.tabId;
    void exportGoogleFileInTab(tabId, msg.fileId, msg.host).then((text) => {
      sendResponse({ text: text || "" });
    });
    return true;
  }

  // --- AI SETTINGS ---
  if (msg?.type === "GET_AI_SETTINGS") {
    chrome.storage.local.get("aiSettings", (result) => {
      sendResponse({ settings: result.aiSettings || {} });
    });
    return true;
  }

  if (msg?.type === "SAVE_AI_SETTINGS") {
    chrome.storage.local.set({ aiSettings: msg.settings }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg?.type === "TEST_AI_CONNECTION") {
    void (async () => {
      try {
        const res = await fetch(validateLocalEndpoint(msg.apiEndpoint || "http://127.0.0.1:10086/v1/chat/completions"), {
          method: "POST",
          signal: AbortSignal.timeout(120000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: msg.modelName || "local-model",
            messages: [{ role: "user", content: "Hello" }],
            stream: false,
            max_tokens: 10,
          }),
        });
        if (!res.ok) throw new Error(`Local AI request failed (HTTP ${res.status}).`);
        const data = await res.json();
        if (!data.choices?.[0]?.message?.content && !data.response && !data.text) throw new Error("AI response has no text.");
        sendResponse({ ok: true, response: data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // --- GOOGLE AUTH ---
  if (msg?.type === "GOOGLE_LOGIN") {
    const clientId = GOOGLE_CLIENT_ID.trim();
    if (!clientId) {
      sendResponse({ ok: false, error: "Configure GOOGLE_CLIENT_ID in oauth_config.js; see README.md." });
      return false;
    }
    const redirectUri = chrome.identity.getRedirectURL();
    const state = crypto.randomUUID();
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("https://www.googleapis.com/auth/forms.body")}&state=${encodeURIComponent(state)}&prompt=select_account`;

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "Authentication failed" });
      } else {
        const hash = responseUrl.split("#")[1];
        const params = new URLSearchParams(hash);
        if (params.get("state") !== state) {
          sendResponse({ ok: false, error: "OAuth state mismatch. Please sign in again." });
          return;
        }
        const token = params.get("access_token");
        if (token) {
          chrome.storage.session.set({ googleAuthToken: token, googleAuthExpiresAt: Date.now() + Number(params.get("expires_in") || 3600) * 1000 });
          sendResponse({ ok: true, token });
        } else {
          sendResponse({ ok: false, error: "No access token returned" });
        }
      }
    });
    return true;
  }

  if (msg?.type === "CHECK_GOOGLE_AUTH") {
    chrome.storage.session.get(["googleAuthToken", "googleAuthExpiresAt"], (result) => {
      sendResponse(result.googleAuthToken && result.googleAuthExpiresAt > Date.now() ? { loggedIn: true, token: result.googleAuthToken } : { loggedIn: false });
    });
    return true;
  }

  if (msg?.type === "GOOGLE_LOGOUT") {
    chrome.storage.session.remove(["googleAuthToken", "googleAuthExpiresAt"], () => sendResponse({ ok: true }));
    return true;
  }

  // --- CREATE GOOGLE FORM (WITH QUIZ SUPPORT & DUPLICATE FIX) ---
  if (msg?.type === "CREATE_GOOGLE_FORM") {
    const { title, description, questions } = msg;
    void (async () => {
      try {
        validateQuiz({ title, questions });
        const auth = await chrome.storage.session.get(["googleAuthToken", "googleAuthExpiresAt"]);
        if (!auth.googleAuthToken || auth.googleAuthExpiresAt <= Date.now()) throw new Error("Please sign in with Google again.");
        const token = auth.googleAuthToken;
        const createRes = await fetch("https://forms.googleapis.com/v1/forms", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ info: { title: title || "Untitled Quiz", documentTitle: title || "Untitled Quiz" } }),
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          sendResponse({ ok: false, error: `Form creation failed (${createRes.status}): ${errText}` });
          return;
        }

        const formData = await createRes.json();
        const formId = formData.formId;
        const requests = [];

        requests.push({
          updateSettings: {
            settings: { quizSettings: { isQuiz: true } },
            updateMask: "quizSettings",
          },
        });

        if (description) {
          requests.push({ updateFormInfo: { info: { description }, updateMask: "description" } });
        }

        if (questions && Array.isArray(questions) && questions.length > 0) {
          questions.forEach((q, index) => {
            const item = {
              title: q.title || `Question ${index + 1}`,
              questionItem: { question: { required: Boolean(q.required) } },
            };

            const qType = (q.type || "short_answer").toLowerCase();

            const cleanOptions = (opts) => [...new Set((opts || []).map(String).map((o) => o.trim()))].filter((o) => o !== "");

            if (qType === "multiple_choice" || qType === "choice") {
              item.questionItem.question.choiceQuestion = {
                type: "RADIO",
                options: cleanOptions(q.options).map((opt) => ({ value: opt })),
              };
            } else if (qType === "checkbox" || qType === "checkboxes") {
              item.questionItem.question.choiceQuestion = {
                type: "CHECKBOX",
                options: cleanOptions(q.options).map((opt) => ({ value: opt })),
              };
            } else if (qType === "dropdown") {
              item.questionItem.question.choiceQuestion = {
                type: "DROP_DOWN",
                options: cleanOptions(q.options).map((opt) => ({ value: opt })),
              };
            } else if (qType === "paragraph" || qType === "long_answer") {
              item.questionItem.question.textQuestion = { paragraph: true };
            } else {
              item.questionItem.question.textQuestion = { paragraph: false };
            }

            if (q.correctAnswer !== undefined && q.points !== undefined) {
              const correctAnswers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
              item.questionItem.question.grading = {
                pointValue: Number(q.points),
                correctAnswers: {
                  answers: correctAnswers.map((ans) => ({ value: String(ans).trim() })),
                },
              };
            }

            requests.push({ createItem: { item, location: { index } } });
          });
        }

        if (requests.length > 0) {
          const updateRes = await fetch(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ requests }),
          });

          if (!updateRes.ok) {
            const errText = await updateRes.text();
            sendResponse({ ok: false, error: `Question creation failed (${updateRes.status}): ${errText}` });
            return;
          }
        }

        sendResponse({ ok: true, formId, formUrl: `https://docs.google.com/forms/d/${formId}/edit` });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // --- CALL LOCAL AI ---
  if (msg?.type === "CALL_LOCAL_AI") {
    const { prompt, apiEndpoint, modelName } = msg;
    void (async () => {
      try {
        let endpoint = apiEndpoint;
        let model = modelName;
        if (!endpoint || !model) {
          const settings = await new Promise((resolve) => {
            chrome.storage.local.get("aiSettings", (result) => resolve(result.aiSettings || {}));
          });
          endpoint = endpoint || settings.apiEndpoint || "http://127.0.0.1:10086/v1/chat/completions";
          model = model || settings.modelName || "local-model";
        }

        const res = await fetch(validateLocalEndpoint(endpoint), {
          method: "POST",
          signal: AbortSignal.timeout(120000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            temperature: 0.7,
          }),
        });
        if (!res.ok) throw new Error(`Local AI request failed (HTTP ${res.status}).`);
        const data = await res.json();
        const responseText = data.choices?.[0]?.message?.content || data.response || data.text || "";
        if (!responseText) throw new Error("AI response has no text.");
        sendResponse({ ok: true, text: responseText });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});

if (chrome.sidePanel?.onOpened) {
  chrome.sidePanel.onOpened.addListener((info) => {
    if (info.tabId != null) {
      addOpenPanelTab(info.tabId);
      chrome.runtime.sendMessage({ type: "PANEL_OPENED", tabId: info.tabId }).catch(() => {});
    }
  });
}
if (chrome.sidePanel?.onClosed) {
  chrome.sidePanel.onClosed.addListener((info) => {
    if (info.tabId != null) {
      removeOpenPanelTab(info.tabId);
    }
    chrome.runtime.sendMessage({ type: "PANEL_CLOSED" }).catch(() => {});
  });
}