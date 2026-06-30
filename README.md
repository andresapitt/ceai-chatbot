# ShineVR Technical Support Chatbot

A free, terminal-based support assistant for **ShineVR**, a B2B healthcare
company providing evidence-based VR therapy software to hospitals and clinics.
It guides non-technical clinical users through the hardware and login issues
that make up roughly 80% of ShineVR support tickets, across all three
deployment models: **Meta Quest 2/3**, **Pico Neo 3**, and the **mobile app**.

Built with [Google AI Studio](https://aistudio.google.com) and the
`google-genai` SDK, running on **Gemini 2.5 Flash** (free tier).

## What it helps with

- Connecting headsets to hospital / clinic Wi-Fi
- Pairing and navigating with controllers
- Fixing fuzzy screens and recentering the view
- Logging in and entering platform Unlock Codes

## Setup

1. **Get a free API key**
   Go to [aistudio.google.com](https://aistudio.google.com), sign in with any
   Google account (no credit card, default Free Tier), and click **Get API
   key** to create one.

2. **Add your key** (kept out of git)
   ```bash
   cp .env.example .env
   ```
   Open `.env` and paste your key after `GEMINI_API_KEY=`.
   The `.env` file is git-ignored, so your key never reaches GitHub.

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```
   (Or directly: `pip install google-genai python-dotenv`.)

4. **Run the chatbot**
   ```bash
   python chatbot.py
   ```
   Type `quit`, `exit`, or `bye` to leave.

## How it works

| Concern | Where |
|---|---|
| Conversation memory | The `client.chats` session tracks history automatically |
| Model | `gemini-2.5-flash` (lightweight, fast, free-tier friendly) |
| Rate safety | A sliding-window limiter holds to 15 requests per minute |
| Secrets | API key read from the environment / `.env`, never hard-coded |
| Persona | A ShineVR support system instruction in `chatbot.py` |

## Security

The API key is a secret. It lives only in your local `.env` file, which is
listed in `.gitignore`. Never paste a real key into source code, commit it, or
share it. If a key is ever exposed, regenerate it in Google AI Studio.

## The build team

This project was specified by a five-agent full-stack team (see `agents/`):
Database & System Architect, API & Backend Developer, Frontend Engineer,
DevOps & Infrastructure Lead, and Product & QA Orchestrator.
