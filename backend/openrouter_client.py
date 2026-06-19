"""
openrouter_client.py
====================
Central OpenRouter API wrapper.
Handles auth headers, model selection, retries, and structured JSON responses.
All other modules import from here.

Fixes applied (2026-06-08)
--------------------------
  FIX-OR-01  vision_completion now passes system_prompt and expect_json=True
             to chat_completion so the AI response is always requested and
             validated as JSON — not free-form text with random markdown fences.
             Previously the vision path bypassed both, causing JSON parse errors
             in document_verifier every time a document image was checked.

  FIX-OR-02  Markdown fence stripping in chat_completion replaced with the
             same robust _strip_json_fences() regex used in document_verifier.
             The old split("```")[1] approach produced wrong substrings when
             the model response contained more than two fence markers.

  FIX-OR-03  vision_completion now accepts and forwards a temperature param
             (default 0.0 for deterministic JSON output). Previously it was
             silently using the chat_completion default of 0.2, making
             verification responses non-deterministic.

  FIX-OR-04  vision_completion now accepts and forwards system_prompt so
             callers (document_verifier) can pass _VERIFY_SYSTEM_PROMPT
             directly instead of embedding it in the user message.
"""

import os
import json
import re
import time
import logging
from typing import Optional
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL       = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4-5")
OPENROUTER_API_KEY  = os.getenv("OPENROUTER_API_KEY", "")
SITE_URL            = os.getenv("SITE_URL", "http://localhost:3000")
APP_NAME            = os.getenv("APP_NAME", "RecruitmentSystem")

MAX_RETRIES  = 3
RETRY_DELAY  = 2  # seconds


class OpenRouterError(Exception):
    """Raised when OpenRouter API returns an error."""
    pass


def _build_headers() -> dict:
    """Build required OpenRouter request headers."""
    if not OPENROUTER_API_KEY:
        raise OpenRouterError("OPENROUTER_API_KEY is not set in environment variables.")
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": APP_NAME,
    }


# ---------------------------------------------------------------------------
# FIX-OR-02: Robust markdown fence stripping (replaces the fragile split logic)
# ---------------------------------------------------------------------------

def _strip_json_fences(raw: str) -> str:
    """
    Remove markdown code fences from an AI response and return clean JSON text.

    Handles all common patterns the model may produce:
      ```json\\n{...}\\n```
      ```\\n{...}\\n```
      {... bare JSON without any fences ...}

    The old approach used raw.split("```")[1] which broke whenever the response
    contained more than two fence markers (e.g. nested examples in the reply),
    producing wrong substrings that then failed json.loads.
    """
    text = raw.strip()

    # Primary pattern: optional ```json or ``` at start, matching ``` at end
    fence_re = re.compile(
        r"^```(?:json)?\s*\n?(.*?)\n?```\s*$",
        re.DOTALL | re.IGNORECASE,
    )
    match = fence_re.match(text)
    if match:
        return match.group(1).strip()

    # Fallback: strip a leading fence with no closing counterpart
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def chat_completion(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    expect_json: bool = False,
    system_prompt: Optional[str] = None,
) -> str:
    """
    Send a chat completion request to OpenRouter.

    Args:
        messages:      List of {"role": ..., "content": ...} dicts.
        model:         OpenRouter model string.
        temperature:   Sampling temperature (lower = more deterministic).
        max_tokens:    Max tokens in response.
        expect_json:   If True, sets response_format to JSON and validates output.
        system_prompt: Optional system message prepended to messages.

    Returns:
        Raw response string (JSON string if expect_json=True).

    Raises:
        OpenRouterError: On API errors or JSON parse failures.
    """
    if system_prompt:
        messages = [{"role": "system", "content": system_prompt}] + messages

    payload = {
        "model":       model,
        "messages":    messages,
        "temperature": temperature,
        "max_tokens":  max_tokens,
    }

    if expect_json:
        payload["response_format"] = {"type": "json_object"}

    headers = _build_headers()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(OPENROUTER_API_URL, headers=headers, json=payload)

            if response.status_code == 429:
                wait = RETRY_DELAY * attempt
                logger.warning(
                    "Rate limited. Retrying in %ds (attempt %d/%d)", wait, attempt, MAX_RETRIES
                )
                time.sleep(wait)
                continue

            if response.status_code != 200:
                raise OpenRouterError(
                    f"OpenRouter API error {response.status_code}: {response.text}"
                )

            data    = response.json()
            content = data["choices"][0]["message"]["content"]

            if expect_json:
                # FIX-OR-02: use the robust fence stripper instead of split("```")
                clean = _strip_json_fences(content)

                # Validate it's real JSON before returning
                try:
                    json.loads(clean)
                except json.JSONDecodeError as e:
                    raise OpenRouterError(
                        f"OpenRouter returned invalid JSON after fence stripping: {e} "
                        f"| raw snippet: {content[:300]}"
                    )
                return clean

            return content

        except httpx.TimeoutException:
            logger.warning("Request timed out (attempt %d/%d)", attempt, MAX_RETRIES)
            if attempt == MAX_RETRIES:
                raise OpenRouterError("OpenRouter request timed out after all retries.")
            time.sleep(RETRY_DELAY * attempt)

        except json.JSONDecodeError as e:
            raise OpenRouterError(f"OpenRouter returned invalid JSON: {e}")

    raise OpenRouterError("OpenRouter request failed after all retries.")


def chat_completion_json(
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.1,
    max_tokens: int = 2048,
    system_prompt: Optional[str] = None,
) -> dict:
    """
    Convenience wrapper: same as chat_completion but parses and returns a dict.

    Returns:
        Parsed JSON dict from the model response.
    """
    raw = chat_completion(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        expect_json=True,
        system_prompt=system_prompt,
    )
    return json.loads(raw)


def vision_completion(
    image_base64: str,
    media_type: str,
    prompt: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1024,
    temperature: float = 0.0,          # FIX-OR-03: deterministic by default
    system_prompt: Optional[str] = None,  # FIX-OR-04: forward system prompt
) -> str:
    """
    Send a vision request with an image + text prompt to OpenRouter.

    Args:
        image_base64:  Base64-encoded image string.
        media_type:    e.g. "image/jpeg", "image/png".
        prompt:        Text instruction about the image.
        model:         Must be a vision-capable model.
        max_tokens:    Max tokens in response.
        temperature:   Sampling temperature. Defaults to 0.0 for deterministic
                       JSON output (FIX-OR-03).
        system_prompt: Optional system message (FIX-OR-04). Pass
                       _VERIFY_SYSTEM_PROMPT here from document_verifier so the
                       model receives full instructions even for vision calls.

    Returns:
        JSON string (validated by chat_completion when expect_json=True).

    Notes:
        FIX-OR-01: expect_json=True is now passed to chat_completion so the
        response_format header is set and the JSON fence-stripper + validator
        run on every vision response. Previously this was omitted, meaning the
        AI returned free-form text that broke json.loads in document_verifier.
    """
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{image_base64}"
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }
    ]

    # FIX-OR-01: added expect_json=True so the API enforces JSON output and
    # the response is validated before being returned to the caller.
    # FIX-OR-03: temperature forwarded (default 0.0 — deterministic).
    # FIX-OR-04: system_prompt forwarded so verification instructions reach the model.
    return chat_completion(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,       # FIX-OR-03
        expect_json=True,              # FIX-OR-01
        system_prompt=system_prompt,   # FIX-OR-04
    )