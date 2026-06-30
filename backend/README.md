# ShineVR Secure Backend

A tiny serverless function that keeps the Gemini API key off the browser. The
static frontend (in `../docs`) POSTs the conversation here. This function adds
the key (from an environment variable) and the system prompt, calls Gemini, and
returns only the reply.

```
Browser (GitHub Pages)  --POST {contents}-->  /api/chat  --key + prompt-->  Gemini
        no key                                 key in env var
```

## Endpoint

`POST /api/chat`

Request:
```json
{ "contents": [ { "role": "user", "parts": [ { "text": "My Quest will not connect to wifi" } ] } ] }
```
Response:
```json
{ "reply": "I can help you with that. First, make sure your Meta Quest is on..." }
```

## Deploy to Vercel (free)

1. Install the CLI and log in:
   ```bash
   npm i -g vercel
   vercel login
   ```
2. From this `backend/` folder, deploy:
   ```bash
   vercel
   ```
   Accept the defaults. Vercel detects `api/chat.js` as a function.
3. Add your secrets in the Vercel dashboard (Project, Settings, Environment
   Variables), for Production and Preview:
   - `GEMINI_API_KEY` = your key from https://aistudio.google.com
   - `ALLOWED_ORIGIN` = `https://andresapitt.github.io` (your Pages URL, no slash)
4. Deploy to production:
   ```bash
   vercel --prod
   ```
   You get a URL like `https://ceai-chatbot-backend.vercel.app`. Your endpoint
   is that URL plus `/api/chat`.

## Point the frontend at it

In `../docs/app.js`, set:
```js
var BACKEND_URL = "https://YOUR-APP.vercel.app/api/chat";
```
Commit and push. On GitHub Pages the app now routes through the backend, hides
the key panel, and users never enter a key.

## CORS

The function only returns the `Access-Control-Allow-Origin` header for the exact
`ALLOWED_ORIGIN`, and it rejects browser POSTs from any other origin with 403.
To allow a second origin (for example a local test server), change
`ALLOWED_ORIGIN`, or extend the check in `api/chat.js`.

## Honest limitation

CORS is enforced by browsers, not by the server. A non-browser client (curl, a
script) can still call this endpoint directly and spend your quota, because it
simply does not send a blocked `Origin`. For a public course demo that is
usually fine. To harden it, add one or more of: a shared secret header the
frontend sends and the function checks, per-IP rate limiting, or a platform
WAF. Ask and this can be added.

## Alternatives

- **Netlify Functions**: move `api/chat.js` to `netlify/functions/chat.js`,
  export a `handler`, set the same env vars. Same idea.
- **Render / Railway** (always-on Node or the Python Flask `../app.py`): better
  if you want server-side conversation state or background rate limiting.
