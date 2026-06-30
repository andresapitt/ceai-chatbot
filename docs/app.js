// ShineVR Support: static (GitHub Pages) build
// =============================================
// This version has NO backend. It calls the Gemini REST API directly from the
// browser. The user supplies their own API key, which is stored only in this
// browser's localStorage and never committed to the repo.
//
// Trade-off (be honest about it): a browser-only app cannot keep an API key
// secret from the person using the browser. That is why the key is entered by
// the user and should be a low-quota throwaway key, not a shared one.

(function () {
  "use strict";

  var MODEL = "gemini-2.5-flash";
  var ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    MODEL +
    ":generateContent";
  var KEY_STORE = "shinevr_api_key";
  var RPM_LIMIT = 15; // free-tier safe limit
  var WINDOW_MS = 60000;

  var GREETING =
    "Hello, I am the ShineVR support assistant. I can help with Wi-Fi, " +
    "controllers, fuzzy screens, recentering, logins, and unlock codes.\n\n" +
    "To start: which device are you using (Meta Quest, Pico Neo, or the " +
    "phone app), and what is happening?";

  // Fallback prompt if knowledge.md cannot be fetched (e.g. opened via file://).
  var FALLBACK_PROMPT =
    "You are the ShineVR Technical Support Assistant. Help non-technical " +
    "healthcare users troubleshoot Meta Quest, Pico Neo, and mobile app issues " +
    "(Wi-Fi, controllers, fuzzy screens, recentering, logins, unlock codes). " +
    "Give one clear step at a time. Never use em dashes. If a device is broken " +
    "or a code will not work, tell them to email support@shine-vr.com.";

  var systemPrompt = FALLBACK_PROMPT;

  // Conversation history in Gemini format: {role:'user'|'model', parts:[{text}]}
  var history = [];
  var callTimes = []; // timestamps for the client-side rate limiter

  // --- elements -------------------------------------------------------------
  var messages = document.getElementById("messages");
  var form = document.getElementById("composer");
  var input = document.getElementById("input");
  var sendBtn = document.getElementById("send");
  var resetBtn = document.getElementById("reset");
  var keyBtn = document.getElementById("keyBtn");
  var quick = document.getElementById("quick");
  var keyPanel = document.getElementById("keyPanel");
  var keyInput = document.getElementById("keyInput");
  var keyShow = document.getElementById("keyShow");
  var keySave = document.getElementById("keySave");
  var keyError = document.getElementById("keyError");

  // --- key management -------------------------------------------------------
  function getKey() {
    return localStorage.getItem(KEY_STORE) || "";
  }
  function showKeyPanel() {
    keyError.hidden = true;
    keyInput.value = "";
    keyPanel.hidden = false;
    // Inline style wins over any (possibly cached) stylesheet rule.
    keyPanel.style.display = "flex";
    keyInput.focus();
  }
  function hideKeyPanel() {
    keyPanel.hidden = true;
    // Force it gone even if an old cached style.css forces display:flex.
    keyPanel.style.display = "none";
    input.focus();
  }

  keySave.addEventListener("click", function () {
    var val = keyInput.value.trim();
    if (!val) {
      keyError.textContent = "Please paste a key.";
      keyError.hidden = false;
      return;
    }
    localStorage.setItem(KEY_STORE, val);
    hideKeyPanel();
  });
  keyInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") keySave.click();
  });
  keyShow.addEventListener("change", function () {
    keyInput.type = keyShow.checked ? "text" : "password";
  });
  keyBtn.addEventListener("click", showKeyPanel);

  // --- rendering ------------------------------------------------------------
  function addMessage(text, kind) {
    var el = document.createElement("div");
    el.className = "msg msg--" + kind;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }
  function addTyping() {
    var el = document.createElement("div");
    el.className = "msg msg--bot";
    el.innerHTML =
      '<span class="typing" aria-label="Assistant is typing">' +
      "<span></span><span></span><span></span></span>";
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }
  function setBusy(busy) {
    sendBtn.disabled = busy;
    input.disabled = busy;
    if (!busy) input.focus();
  }

  // --- rate limiter (client side) ------------------------------------------
  function withinRateLimit() {
    var now = Date.now();
    callTimes = callTimes.filter(function (t) {
      return now - t < WINDOW_MS;
    });
    if (callTimes.length >= RPM_LIMIT) return false;
    callTimes.push(now);
    return true;
  }

  // --- Gemini call ----------------------------------------------------------
  async function callGemini(userText) {
    history.push({ role: "user", parts: [{ text: userText }] });
    var body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: history,
    };
    var res = await fetch(ENDPOINT + "?key=" + encodeURIComponent(getKey()), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var data = await res.json();
    if (!res.ok) {
      // roll back the user turn so a retry is clean
      history.pop();
      var msg = (data && data.error && data.error.message) || ("HTTP " + res.status);
      throw new Error(msg);
    }
    var parts =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts;
    var reply = parts ? parts.map(function (p) { return p.text || ""; }).join("") : "";
    history.push({ role: "model", parts: [{ text: reply }] });
    return reply;
  }

  // --- send flow ------------------------------------------------------------
  async function send(text) {
    var message = (text || "").trim();
    if (!message) return;

    if (!getKey()) {
      showKeyPanel();
      return;
    }
    if (!withinRateLimit()) {
      addMessage(
        "You are sending messages too quickly. The free tier allows 15 per " +
          "minute. Please wait a moment and try again.",
        "error"
      );
      return;
    }

    addMessage(message, "user");
    input.value = "";
    autoGrow();
    setBusy(true);
    var typing = addTyping();

    try {
      var reply = await callGemini(message);
      typing.remove();
      addMessage(reply || "I did not get a response. Please try again.", "bot");
    } catch (err) {
      typing.remove();
      var hint = "";
      if (/api key|invalid|permission|401|403/i.test(err.message)) {
        hint = " Check your API key (use the Key button).";
      }
      addMessage("Sorry, I could not reach the assistant: " + err.message + hint, "error");
    } finally {
      setBusy(false);
    }
  }

  // --- input behaviour ------------------------------------------------------
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  }
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });
  quick.addEventListener("click", function (e) {
    if (e.target.classList.contains("chip")) send(e.target.textContent);
  });
  resetBtn.addEventListener("click", function () {
    history = [];
    messages.innerHTML = "";
    addMessage(GREETING, "bot");
    input.focus();
  });

  // --- startup --------------------------------------------------------------
  async function loadPrompt() {
    try {
      var res = await fetch("knowledge.md", { cache: "no-cache" });
      if (res.ok) {
        var text = (await res.text()).trim();
        if (text) systemPrompt = text;
      }
    } catch (err) {
      // keep the fallback prompt (e.g. when opened directly from disk)
    }
  }

  (async function init() {
    await loadPrompt();
    addMessage(GREETING, "bot");
    if (!getKey()) showKeyPanel();
    else input.focus();
  })();
})();
