import json
import re

from openai import AsyncOpenAI

from app.core.config import get_settings


ALLOWED_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".py", ".vue", ".svelte", ".html", ".css", ".scss"}

IMPORTANT_PATHS = [
    "package.json", "next.config", "vite.config", "tsconfig", "middleware",
    "app/", "pages/", "components/", "src/", "lib/", "utils/", "api/",
    "server/", "routes/", "views/", "templates/", "tests/", "test/",
]

IGNORE_PATHS = [
    "node_modules", ".next", "dist", "build", ".git", "coverage",
    "public/", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ".png", ".jpg", ".jpeg", ".svg", ".webp", ".mp4", ".mov",
]


def is_useful_file(path: str) -> bool:
    ignored = any(item in path for item in IGNORE_PATHS)
    allowed = any(path.endswith(ext) for ext in ALLOWED_EXTENSIONS)
    important = any(item in path for item in IMPORTANT_PATHS)
    return not ignored and allowed and important


async def call_ai(prompt: str, temperature: float = 0.3) -> str:
    """Call the configured LLM (Gemini preferred, OpenAI fallback) and return the text.

    Keys are read from settings (loaded from .env), and the Gemini model is routed
    through its OpenAI-compatible endpoint via the configured base_url. Raises
    RuntimeError with a clear message when no provider is configured or all fail.
    """
    settings = get_settings()
    errors: list[str] = []

    if settings.GEMINI_API_KEY:
        try:
            client = AsyncOpenAI(api_key=settings.GEMINI_API_KEY, base_url=settings.GEMINI_BASE_URL)
            response = await client.chat.completions.create(
                model="gemini-2.5-flash",
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=4096,
            )
            return response.choices[0].message.content or ""
        except Exception as e:  # noqa: BLE001 - fall back to OpenAI on any provider error
            errors.append(f"gemini: {e}")

    if settings.OPENAI_API_KEY:
        try:
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=4096,
            )
            return response.choices[0].message.content or ""
        except Exception as e:  # noqa: BLE001
            errors.append(f"openai: {e}")

    detail = "; ".join(errors) if errors else "no AI provider configured (set GEMINI_API_KEY or OPENAI_API_KEY)"
    raise RuntimeError(f"AI request failed: {detail}")


def extract_json_object(text: str) -> dict:
    """Best-effort extraction of a JSON object from an LLM response.

    Handles raw JSON, ```json fenced blocks, and prose surrounding a JSON object.
    Returns {} if nothing parseable is found.
    """
    if not text:
        return {}
    candidate = text.strip()

    # Strip Markdown code fences if present.
    fence = re.search(r"```(?:json)?\s*(.*?)```", candidate, re.DOTALL)
    if fence:
        candidate = fence.group(1).strip()

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # Fall back to the substring between the first '{' and the last '}'.
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(candidate[start:end + 1])
        except json.JSONDecodeError:
            return {}
    return {}


async def generate_test_cases(
    file_contents: list[dict],
    global_instruction: str | None,
    repo_name: str,
    repo_owner: str,
    target_domain: str,
) -> list[dict]:
    """Use the LLM to generate test cases from repo file contents."""
    prompt = f"""You are an expert QA engineer. Analyze the following source files from the repository '{repo_owner}/{repo_name}' and generate comprehensive automated test cases.

Target application URL: {target_domain}
Global instructions: {global_instruction or 'None'}

Source Files:
"""
    for fc in file_contents:
        prompt += f"\n--- File: {fc['path']} ---\n{fc['content'][:3500]}\n"

    prompt += """
Based on the above code, generate test cases that cover:
- UI interactions (buttons, forms, navigation, modals)
- API endpoints (GET, POST, PUT, DELETE)
- Authentication flows (login, register, logout, auth guards)
- Edge cases (empty states, errors, invalid inputs)
- Integration flows (multi-step workflows)

Rules:
- Cover the most important user journeys first
- Include positive and negative test scenarios
- Be specific about which files/routes are affected
- Keep descriptions concise, one line each
- Return only valid JSON matching this schema:

{
  "testCases": [
    {
      "title": "short descriptive title",
      "description": "one-line description of what to test",
      "type": "ui|auth|api|form|integration|edge-case",
      "priority": "low|medium|high",
      "targetRoute": "/api/path or /page/path or null",
      "targetFiles": ["relative/path/to/file1", "relative/path/to/file2"],
      "expectedResult": "one-line expected outcome"
    }
  ]
}
"""

    text = await call_ai(prompt, temperature=0.3)
    data = extract_json_object(text)
    return data.get("testCases", [])
