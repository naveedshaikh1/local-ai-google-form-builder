import { validateQuiz } from "./validation.js";
document.addEventListener("DOMContentLoaded", async () => {
  // Auth elements
  const authStatus = document.getElementById("authStatus");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // Settings elements
  const apiEndpointInput = document.getElementById("apiEndpoint");
  const modelNameInput = document.getElementById("modelName");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const testConnectionBtn = document.getElementById("testConnectionBtn");
  const testResult = document.getElementById("testResult");

  // Generate elements
  const quizTypeSelect = document.getElementById("quizType");
  const docTextArea = document.getElementById("docText");
  const fileInput = document.getElementById("fileInput");
  const generateBtn = document.getElementById("generateBtn");

  // Console elements
  const consoleSection = document.getElementById("consoleSection");
  const aiConsole = document.getElementById("aiConsole");
  const copyJsonBtn = document.getElementById("copyJsonBtn");
  const downloadJsonBtn = document.getElementById("downloadJsonBtn");

  // Preview elements
  const previewSection = document.getElementById("previewSection");
  const formPreview = document.getElementById("formPreview");

  // Deploy elements
  const deploySection = document.getElementById("deploySection");
  const deployBtn = document.getElementById("deployBtn");
  const deployStatus = document.getElementById("deployStatus");
  const formLink = document.getElementById("formLink");
  const formUrl = document.getElementById("formUrl");

  let authToken = null;
  let generatedJson = null;

  // --- AUTH FUNCTIONS ---
  function showLoggedIn() {
    authStatus.textContent = "✅ Signed in with Google";
    authStatus.className = "status-bar success";
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    generateBtn.disabled = false;
  }

  function showLoggedOut() {
    authStatus.textContent = "⚠️ Sign in with Google to create forms";
    authStatus.className = "status-bar error";
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    generateBtn.disabled = false;
    authToken = null;
  }

  async function checkAuth() {
    const resp = await chrome.runtime.sendMessage({ type: "CHECK_GOOGLE_AUTH" });
    if (resp.loggedIn) {
      authToken = resp.token;
      showLoggedIn();
    } else {
      showLoggedOut();
    }
  }

  loginBtn.addEventListener("click", async () => {
    const resp = await chrome.runtime.sendMessage({ type: "GOOGLE_LOGIN" });
    if (resp.ok) {
      authToken = resp.token;
      showLoggedIn();
    } else {
      authStatus.textContent = `❌ Login failed: ${resp.error}`;
      authStatus.className = "status-bar error";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "GOOGLE_LOGOUT" });
    showLoggedOut();
  });

  // --- SETTINGS FUNCTIONS ---
  async function loadSettings() {
    const resp = await chrome.runtime.sendMessage({ type: "GET_AI_SETTINGS" });
    if (resp.settings) {
      apiEndpointInput.value = resp.settings.apiEndpoint || "http://127.0.0.1:10086/v1/chat/completions";
      modelNameInput.value = resp.settings.modelName || "local-model";
    }
  }

  saveSettingsBtn.addEventListener("click", async () => {
    const settings = {
      apiEndpoint: apiEndpointInput.value.trim(),
      modelName: modelNameInput.value.trim()
    };
    await chrome.runtime.sendMessage({ type: "SAVE_AI_SETTINGS", settings });
    testResult.textContent = "✅ Settings saved!";
    testResult.className = "test-result success";
    setTimeout(() => { testResult.textContent = ""; }, 2000);
  });

  testConnectionBtn.addEventListener("click", async () => {
    testResult.textContent = "Testing connection...";
    testResult.className = "test-result";
    
    const resp = await chrome.runtime.sendMessage({ 
      type: "TEST_AI_CONNECTION",
      apiEndpoint: apiEndpointInput.value.trim(),
      modelName: modelNameInput.value.trim()
    });

    if (resp.ok) {
      testResult.textContent = `✅ Connection successful! Model responded.`;
      testResult.className = "test-result success";
    } else {
      testResult.textContent = `❌ Connection failed: ${resp.error}`;
      testResult.className = "test-result error";
    }
  });

  // --- FILE UPLOAD ---
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileName = file.name.toLowerCase();
    
    const supported = [".txt", ".md", ".csv", ".json"];
    if (supported.some(ext => fileName.endsWith(ext))) {
      try {
        docTextArea.value = await file.text();
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    }
  });

  // --- GENERATE FORM ---
  generateBtn.addEventListener("click", async () => {
    const documentText = docTextArea.value.trim();
    if (!documentText) {
      alert("Please enter or upload text first.");
      return;
    }

    generateBtn.disabled = true;
    generatedJson = null;
    previewSection.classList.add("hidden");
    deploySection.classList.add("hidden");
    formLink.classList.add("hidden");
    generateBtn.textContent = "Thinking...";
    consoleSection.classList.remove("hidden");
    aiConsole.textContent = "Sending to Local AI...";

    const quizType = quizTypeSelect.value;
    let typeInstruction = "";
    
    if (quizType === "mcq") {
      typeInstruction = "ALL questions MUST be of type 'multiple_choice' with exactly 4 options and 1 correct answer.";
    } else if (quizType === "true_false") {
      typeInstruction = "ALL questions MUST be of type 'multiple_choice' with exactly 2 options: ['True', 'False'] and the correct answer must be one of them.";
    } else if (quizType === "short_answer") {
      typeInstruction = "ALL questions MUST be of type 'short_answer' (fill in the blank or short text).";
    } else {
      typeInstruction = "Create a MIX of question types: some 'multiple_choice', some 'short_answer', and some 'multiple_choice' with True/False options.";
    }

    const prompt = `You are a strict JSON generator for Google Forms Quizzes. Based on the document text below, generate a JSON object for a Google Form Quiz. 
Return ONLY valid, parseable JSON. Do NOT include markdown formatting. Do NOT include any text before or after the JSON.

Required JSON Structure:
{
  "title": "Quiz Title",
  "description": "Quiz Description",
  "questions": [
    {
      "title": "Your Name",
      "type": "short_answer",
      "required": true,
      "points": 0
    },
    {
      "title": "Your Class",
      "type": "short_answer",
      "required": true,
      "points": 0
    },
    {
      "title": "What is the capital of France?",
      "type": "multiple_choice",
      "required": true,
      "options": ["London", "Paris", "Berlin", "Madrid"],
      "correctAnswer": "Paris",
      "points": 1
    }
  ]
}

Rules:
1. ${typeInstruction}
2. Valid "type" values: "multiple_choice", "short_answer", "paragraph".
3. Only include "options" array for "multiple_choice".
4. For ANY question with a correct answer, include "correctAnswer" and "points".
5. The first two questions MUST ALWAYS be "Your Name" and "Your Class" with 0 points.

Document Text:
${documentText}`;

    try {
      const aiResp = await chrome.runtime.sendMessage({
        type: "CALL_LOCAL_AI",
        prompt,
        apiEndpoint: apiEndpointInput.value.trim(),
        modelName: modelNameInput.value.trim()
      });

      if (!aiResp.ok) {
        aiConsole.textContent = `❌ AI Error: ${aiResp.error}`;
        return;
      }

      // Clean and parse JSON
      let cleaned = aiResp.text.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      try {
        generatedJson = validateQuiz(JSON.parse(cleaned));
        aiConsole.textContent = JSON.stringify(generatedJson, null, 2);
        
        // Show preview
        renderPreview(generatedJson);
        previewSection.classList.remove("hidden");
        deploySection.classList.remove("hidden");
      } catch (parseErr) {
        aiConsole.textContent = `❌ Failed to parse JSON:\n\n${aiResp.text}`;
      }
    } catch (err) {
      aiConsole.textContent = `❌ Error: ${err.message}`;
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate with Local AI";
    }
  });

  // --- CONSOLE ACTIONS ---
  copyJsonBtn.addEventListener("click", () => {
    if (generatedJson) {
      navigator.clipboard.writeText(JSON.stringify(generatedJson, null, 2));
      copyJsonBtn.textContent = "✅ Copied!";
      setTimeout(() => { copyJsonBtn.textContent = "Copy JSON"; }, 2000);
    }
  });

  downloadJsonBtn.addEventListener("click", () => {
    if (generatedJson) {
      const blob = new Blob([JSON.stringify(generatedJson, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${generatedJson.title || "form"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  // --- PREVIEW ---
  function renderPreview(json) {
    formPreview.replaceChildren();
    const append = (tag, text, className, parent = formPreview) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (className) el.className = className;
      parent.append(el);
      return el;
    };
    append("h3", json.title || "Untitled Form");
    if (json.description) append("p", json.description);
    json.questions.forEach((q, i) => {
      const row = append("div", "", "preview-question");
      append("div", `${i + 1}. ${q.title}${q.required ? " *" : ""}`, "preview-question-title", row);
      if (q.options) q.options.forEach(opt => append("div", `○ ${opt}`, "preview-option", row));
      else append("div", q.type === "paragraph" ? "[Long answer text]" : "[Short answer text]", "preview-option", row);
    });
  }

  // --- DEPLOY ---
  deployBtn.addEventListener("click", async () => {
    if (!generatedJson || !authToken) {
      alert("Please generate a form and sign in first.");
      return;
    }

    deployBtn.disabled = true;
    deployBtn.textContent = "Deploying...";
    deployStatus.textContent = "Creating form in Google Forms...";
    deployStatus.className = "status-bar info";

    formLink.classList.add("hidden");
    try {
    const createResp = await chrome.runtime.sendMessage({
      type: "CREATE_GOOGLE_FORM",
      title: generatedJson.title || "Untitled Quiz",
      description: generatedJson.description || "",
      questions: generatedJson.questions || []
    });

    if (createResp.ok) {
      deployStatus.textContent = "✅ Form created successfully!";
      deployStatus.className = "status-bar success";
      formLink.classList.remove("hidden");
      formUrl.href = createResp.formUrl;
    } else {
      deployStatus.textContent = `❌ Deployment failed: ${createResp.error}`;
      deployStatus.className = "status-bar error";
    }

    } catch (err) {
      deployStatus.textContent = `Deployment failed: ${err.message}`;
    } finally {
    deployBtn.disabled = false;
    deployBtn.textContent = "Deploy to Google Forms";
    }
  });

  // --- INIT ---
  await checkAuth();
  await loadSettings();
});