"""
openrouter_client.py
Central OpenRouter API wrapper.
Handles auth headers, model selection, retries, and structured JSON responses.
All other modules import from here.
"""

import os
import json
import time
import logging
from typing import Optional, Union
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4-5")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
SITE_URL = os.getenv("SITE_URL", "http://localhost:3000")
APP_NAME = os.getenv("APP_NAME", "RecruitmentSystem")

MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


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
        messages: List of {"role": ..., "content": ...} dicts.
        model: OpenRouter model string.
        temperature: Sampling temperature (lower = more deterministic).
        max_tokens: Max tokens in response.
        expect_json: If True, sets response_format to JSON and validates output.
        system_prompt: Optional system message prepended to messages.

    Returns:
        Raw response string (JSON string if expect_json=True).

    Raises:
        OpenRouterError: On API errors or JSON parse failures.
    """
    if system_prompt:
        messages = [{"role": "system", "content": system_prompt}] + messages

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
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
                logger.warning(f"Rate limited. Retrying in {wait}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(wait)
                continue

            if response.status_code != 200:
                raise OpenRouterError(
                    f"OpenRouter API error {response.status_code}: {response.text}"
                )

            data = response.json()
            content = data["choices"][0]["message"]["content"]

            if expect_json:
                # Strip markdown fences if present
                clean = content.strip()
                if clean.startswith("```"):
                    clean = clean.split("```")[1]
                    if clean.startswith("json"):
                        clean = clean[4:]
                    clean = clean.strip()
                # Validate it's real JSON
                json.loads(clean)
                return clean

            return content

        except httpx.TimeoutException:
            logger.warning(f"Request timed out (attempt {attempt}/{MAX_RETRIES})")
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
) -> str:
    """
    Send a vision request with an image + text prompt to OpenRouter.

    Args:
        image_base64: Base64-encoded image string.
        media_type: e.g. "image/jpeg", "image/png".
        prompt: Text instruction about the image.
        model: Must be a vision-capable model.
        max_tokens: Max tokens in response.

    Returns:
        Model response string.
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
    return chat_completion(messages=messages, model=model, max_tokens=max_tokens)