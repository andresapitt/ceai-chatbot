// ShineVR Support: web chat client
// Frontend (Lena): keep it calm and legible, always show what the system is
// doing, and make errors say what to do next. QA (Sofia): never leave the
// user with a dead spinner.

(function () {
  "use strict";

  const messages = document.getElementById("messages");
  const form = document.getElementById("composer");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const resetBtn = document.getElementById("reset");
  const quick = document.getElementById("quick");

  const GREETING =
    "Hello, I am the ShineVR support assistant. I can help with Wi-Fi, " +
    "controllers, fuzzy screens, recentering, logins, and unlock codes.\n\n" +
    "To start: which device are you using (Meta Quest, Pico Neo, or the " +
    "phone app), and what is happening?";

  // --- rendering ------------------------------------------------------------
  function addMessage(text, kind) {
    const el = document.createElement("div");
    el.className = "msg msg--" + kind;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function addTyping() {
    const el = document.createElement("div");
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

  // --- sending --------------------------------------------------------------
  async function send(text) {
    const message = (text || "").trim();
    if (!message) return;

    addMessage(message, "user");
    input.value = "";
    autoGrow();
    setBusy(true);
    const typing = addTyping();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message }),
      });
      const data = await res.json();
      typing.remove();

      if (!res.ok || data.error) {
        addMessage(
          (data && data.error) ||
            "Something went wrong. Please try again in a moment.",
          "error"
        );
      } else {
        addMessage(data.reply, "bot");
      }
    } catch (err) {
      typing.remove();
      addMessage(
        "I could not reach the server. Check your connection and try again.",
        "error"
      );
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

  // Enter to send, Shift+Enter for a new line.
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
    if (e.target.classList.contains("chip")) {
      send(e.target.textContent);
    }
  });

  resetBtn.addEventListener("click", async function () {
    try {
      await fetch("/api/reset", { method: "POST" });
    } catch (err) {
      /* ignore: we reset the view regardless */
    }
    messages.innerHTML = "";
    addMessage(GREETING, "bot");
    input.focus();
  });

  // --- start ----------------------------------------------------------------
  addMessage(GREETING, "bot");
  input.focus();
})();
