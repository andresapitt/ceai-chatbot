"""
ShineVR Technical Support Chatbot: web UI
=========================================

A small Flask server that puts the same ShineVR support assistant behind a
browser chat interface. It reuses the model, persona, and rate limiter from
chatbot.py, so the terminal bot and the web bot behave identically.

Build-team notes:
  - Tomas (Backend): one /api/chat endpoint, the API key read from the env,
    every call rate-limited and wrapped against failure.
  - Priya (Architect): each browser session gets its own genai chat object,
    so conversation history is isolated per user and owned by the SDK.
  - Lena (Frontend): served as a calm, accessible single-page chat.
  - Marcus (DevOps): no secrets in code; the key comes from .env. The single
    rate limiter is shared across all users because the 15 rpm free-tier
    limit applies per API key, not per visitor.
  - Sofia (QA): empty input, missing key, and upstream errors all return a
    clean JSON response instead of a stack trace.

Run:  python app.py   then open http://127.0.0.1:5000
"""

import os
import uuid
import threading

from flask import Flask, request, jsonify, session, render_template

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from google import genai
from google.genai import types

# Reuse the single source of truth from the terminal bot.
from chatbot import MODEL, SYSTEM_INSTRUCTION, RateLimiter, RPM_LIMIT, WINDOW_SECONDS

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "shinevr-dev-secret-change-me")

_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
_client = genai.Client(api_key=_API_KEY) if _API_KEY else None

# Per-session chat objects and a single shared rate limiter (limit is per key).
_chats = {}
_lock = threading.Lock()
_limiter = RateLimiter(RPM_LIMIT, WINDOW_SECONDS)


def _get_chat():
    """Return this browser session's chat, creating it on first use."""
    sid = session.get("sid")
    if not sid:
        sid = uuid.uuid4().hex
        session["sid"] = sid
    with _lock:
        chat = _chats.get(sid)
        if chat is None:
            chat = _client.chats.create(
                model=MODEL,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION
                ),
            )
            _chats[sid] = chat
    return chat


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    if _client is None:
        return jsonify(
            {"error": "The assistant is not configured. The server has no API key."}
        ), 503

    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Please type a message."}), 400

    chat = _get_chat()
    _limiter.wait()  # respect the free-tier 15 requests/minute ceiling
    try:
        response = chat.send_message(message)
        return jsonify({"reply": response.text})
    except Exception as exc:
        return jsonify(
            {"error": f"Sorry, I could not reach the assistant just now: {exc}"}
        ), 502


@app.route("/api/reset", methods=["POST"])
def reset_endpoint():
    """Start a fresh conversation for this session."""
    sid = session.get("sid")
    if sid:
        with _lock:
            _chats.pop(sid, None)
    return jsonify({"ok": True})


if __name__ == "__main__":
    if _client is None:
        print("WARNING: no GEMINI_API_KEY found. Copy .env.example to .env and "
              "add your key, then restart.")
    print("ShineVR web chat running at http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
