"""
ShineVR Technical Support Chatbot
=================================

A free, terminal-based support assistant for ShineVR, built with Google AI
Studio (Gemini) and the google-genai SDK. It guides non-technical clinical
users (clinicians, hospital staff, and patients) through the hardware and
login issues that make up roughly 80% of ShineVR support tickets:

  - Connecting to hospital/clinic Wi-Fi
  - Pairing and using controllers
  - Fixing fuzzy screens and recentering the view
  - Logging in and entering platform Unlock Codes

It covers all three deployment models: Meta Quest 2/3, Pico Neo 3, and the
mobile/smartphone apps.

This file was designed by the five-agent build team:
  - Priya Raghavan (Architect): conversation history is owned by the SDK chat
    session, so the model always has the full context of the support call.
  - Tomas Brennan (Backend): the API key never lives in the code; the client
    is initialised from the environment, and every call is rate-limited and
    wrapped against network failure.
  - Lena Hoffmann (Frontend): a calm, legible terminal interface with clear
    prompts and a friendly greeting for an anxious, non-technical user.
  - Marcus Okonkwo (DevOps): secrets come from .env (git-ignored), nothing is
    hard-coded, and the SDK import fails loudly with a fix.
  - Sofia Marchetti (QA): empty input, exit commands, and errors are all
    handled so the loop never crashes mid-session.

Run:  python chatbot.py
Quit: type 'quit', 'exit', or 'bye'.
"""

import os
import sys
import time
from collections import deque

# --- Backend (Tomas): import the SDK, fail loudly with the fix if missing ---
try:
    from google import genai
    from google.genai import types
except ImportError:
    print("The google-genai SDK is not installed.")
    print("Install it with:  pip install google-genai")
    sys.exit(1)

# Optional .env support so the key can live in a git-ignored file.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


# --- Configuration -----------------------------------------------------------
MODEL = "gemini-2.5-flash"   # lightweight, fast, free-tier friendly
RPM_LIMIT = 15               # free-tier safe limit: 15 requests per minute
WINDOW_SECONDS = 60

SYSTEM_INSTRUCTION = """
You are the ShineVR Technical Support Assistant.

ShineVR is a B2B healthcare technology company that provides evidence-based
virtual reality therapy software to hospitals and clinics for chronic pain
distraction and stress reduction. Your users are clinicians, hospital staff,
and patients. They are rarely technical, are often busy or anxious, and may be
mid-session with a patient waiting.

Your job is to guide them, calmly and clearly, through the common problems:

1. Hardware and connectivity
   - Connecting the headset to local hospital or clinic Wi-Fi, and updating
     network access when it changes.
   - Pairing controllers, replacing controller batteries, and navigating with
     the controllers.
   - Fixing display issues: fuzzy or blurry screens (adjusting the headset fit
     and lenses) and recentering or resetting the central menu / view.

2. Access and platform logins
   - Logging into the ShineVR application.
   - Acquiring and entering platform Unlock Codes.
   - Resetting the central menu when a session will not start.

You support three deployment models. Always confirm which one the user has
before giving device-specific steps:
   - Meta Quest 2 / Quest 3
   - Pico Neo 3
   - Mobile / smartphone app

How you behave:
   - Ask one short question at a time. Do not dump a long list on an anxious
     user. Give the single most likely next step, then check if it worked.
   - Use plain language. Avoid jargon. Number your steps when there is a
     sequence to follow.
   - Be patient and reassuring. The patient's therapy session depends on this
     working, so reduce stress, do not add to it.
   - If you do not know which device they have, or a detail you need, ask
     before guessing.
   - Never invent Unlock Codes, passwords, account details, or Wi-Fi
     credentials. If the user needs a real code or credential, tell them to
     get it from their ShineVR account administrator or the welcome pack.
   - If the problem is outside basic hardware and login help (a broken device,
     a billing question, a clinical question, or a code that genuinely does not
     work after checking), tell them clearly to contact a human ShineVR
     support agent, and summarise what they have already tried.

Style:
   - Never use em dashes (the long dash). Use commas, colons, semicolons,
     full stops, or parentheses instead.
   - Keep replies short and scannable. One clear action beats six options.
""".strip()


# --- Backend (Tomas): respect the free-tier rate limit -----------------------
class RateLimiter:
    """Sliding-window limiter: at most `max_calls` calls per `period` seconds.

    Free-tier Gemini allows 15 requests per minute. This holds the loop just
    long enough to stay under that ceiling instead of erroring out.
    """

    def __init__(self, max_calls, period):
        self.max_calls = max_calls
        self.period = period
        self.calls = deque()

    def wait(self):
        now = time.monotonic()
        # Drop timestamps older than the window.
        while self.calls and now - self.calls[0] >= self.period:
            self.calls.popleft()
        if len(self.calls) >= self.max_calls:
            sleep_for = self.period - (now - self.calls[0])
            if sleep_for > 0:
                print(
                    f"\n[Pausing {sleep_for:.0f}s to stay within the free-tier "
                    f"limit of {self.max_calls} requests per minute...]"
                )
                time.sleep(sleep_for)
            self.calls.popleft()
        self.calls.append(time.monotonic())


# --- Frontend (Lena): the terminal experience --------------------------------
GREETING = (
    "ShineVR Support: Hello, I am the ShineVR support assistant. I can help "
    "with Wi-Fi, controllers, fuzzy screens, recentering, logins, and unlock "
    "codes.\n"
    "To start: which device are you using, a Meta Quest, a Pico Neo, or the "
    "phone app? And what is happening?\n"
    "(Type 'quit' at any time to exit.)\n"
)

EXIT_WORDS = {"quit", "exit", "bye", "q"}


def main():
    # Backend (Tomas): never trust the key to the code. Read it from the env.
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("No API key found.")
        print("Set GEMINI_API_KEY in your environment, or copy .env.example to")
        print(".env and paste your key from https://aistudio.google.com.")
        sys.exit(1)

    try:
        client = genai.Client(api_key=api_key)
        # Architect (Priya): the chat session owns conversation history, so the
        # model keeps the full context of the support call automatically.
        chat = client.chats.create(
            model=MODEL,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION
            ),
        )
    except Exception as exc:
        print(f"Could not start the assistant: {exc}")
        sys.exit(1)

    limiter = RateLimiter(RPM_LIMIT, WINDOW_SECONDS)

    print("=" * 64)
    print("  ShineVR Technical Support  (powered by Gemini)")
    print("=" * 64)
    print(GREETING)

    # QA (Sofia): a continuous loop that survives empty input and errors.
    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nShineVR Support: Take care. End the session in the app "
                  "when you are done.")
            break

        if not user_input:
            continue
        if user_input.lower() in EXIT_WORDS:
            print("ShineVR Support: Glad to help. End the session in the app "
                  "when you are done. Goodbye.")
            break

        limiter.wait()
        try:
            response = chat.send_message(user_input)
            print(f"\nShineVR Support: {response.text}\n")
        except Exception as exc:
            print(
                f"\n[Sorry, I could not reach the assistant just now: {exc}]\n"
                "[Please try again. If it keeps failing, contact ShineVR "
                "support.]\n"
            )


if __name__ == "__main__":
    main()
