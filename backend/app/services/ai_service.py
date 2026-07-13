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
    ".min.js", ".min.css",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ".png", ".jpg", ".jpeg", ".svg", ".webp", ".mp4", ".mov",
]

# Root-level entrypoints have no directory prefix to match IMPORTANT_PATHS, but
# are exactly where vanilla Node/Express/static apps keep their real code.
ROOT_ENTRYPOINTS = {
    "server.js", "server.ts", "index.js", "index.ts", "app.js", "app.ts",
    "main.js", "main.ts", "index.html", "app.py", "main.py",
}


def is_useful_file(path: str) -> bool:
    """A file worth feeding to the LLM: a source file that isn't build noise.

    The previous version also required the path to live under a known framework
    directory (src/, components/, ...), which silently excluded plain apps whose
    code sits at the repo root (server.js) or under public/ (static HTML/JS). We
    now keep any source file by extension and rely on rank_source_file / the
    per-request cap to prioritise the most relevant ones.
    """
    ignored = any(item in path for item in IGNORE_PATHS)
    allowed = any(path.endswith(ext) for ext in ALLOWED_EXTENSIONS)
    return not ignored and allowed


def rank_source_file(path: str) -> tuple:
    """Sort key that surfaces the most test-relevant files first.

    Root entrypoints and files under well-known source dirs rank ahead of
    everything else; among equals, shallower and shorter paths win. Used to pick
    the top-N files when a repo has more source than fits in one prompt.
    """
    name = path.rsplit("/", 1)[-1]
    is_entry = name in ROOT_ENTRYPOINTS
    is_important = any(item in path for item in IMPORTANT_PATHS)
    return (0 if is_entry else 1, 0 if is_important else 1, path.count("/"), len(path))


def select_source_files(tree: list[dict], limit: int = 25) -> list[dict]:
    """Filter a GitHub tree to useful source files, ranked, capped at `limit`."""
    useful = [f for f in tree if is_useful_file(f["path"])]
    useful.sort(key=lambda f: rank_source_file(f["path"]))
    return useful[:limit]


async def call_ai(prompt: str, temperature: float = 0.3, max_tokens: int = 8192) -> str:
    """Call the configured LLM (Gemini preferred, OpenAI fallback) and return the text.

    Keys are read from settings (loaded from .env), and the Gemini model is routed
    through its OpenAI-compatible endpoint via the configured base_url. Raises
    RuntimeError with a clear message when no provider is configured or all fail.

    `max_tokens` must be generous: gemini-2.5-flash is a *thinking* model and its
    reasoning tokens are billed against this budget via the OpenAI-compatible
    endpoint. At 4096 the reasoning alone consumed the budget and the visible JSON
    was truncated (finish_reason="length"), so callers got zero parseable output.
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
                max_tokens=max_tokens,
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
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content or ""
        except Exception as e:  # noqa: BLE001
            errors.append(f"openai: {e}")

    detail = "; ".join(errors) if errors else "no AI provider configured (set GEMINI_API_KEY or OPENAI_API_KEY)"
    raise RuntimeError(f"AI request failed: {detail}")


async def call_ai_tools(
    messages: list[dict],
    tools: list[dict],
    temperature: float = 0.2,
    max_tokens: int = 8192,
) -> dict:
    """Tool-calling chat completion for the agent loop (Gemini preferred,
    OpenAI fallback — same provider strategy as call_ai).

    Takes a full OpenAI-format conversation (system/user/assistant/tool
    messages) plus function-tool definitions, and returns
    {"content": str, "tool_calls": [{"id", "name", "arguments": dict}]}.
    Malformed argument JSON is salvaged with extract_json_object rather than
    crashing the loop. Raises RuntimeError when every provider fails.
    """

    def _parse(response) -> dict:
        msg = response.choices[0].message
        calls = []
        for tc in msg.tool_calls or []:
            raw_args = tc.function.arguments or "{}"
            try:
                args = json.loads(raw_args)
            except json.JSONDecodeError:
                args = extract_json_object(raw_args)
            calls.append({
                "id": tc.id,
                "name": tc.function.name,
                "arguments": args if isinstance(args, dict) else {},
            })
        return {"content": msg.content or "", "tool_calls": calls}

    settings = get_settings()
    errors: list[str] = []

    if settings.GEMINI_API_KEY:
        try:
            client = AsyncOpenAI(api_key=settings.GEMINI_API_KEY, base_url=settings.GEMINI_BASE_URL)
            response = await client.chat.completions.create(
                model="gemini-2.5-flash",
                messages=messages,
                tools=tools,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return _parse(response)
        except Exception as e:  # noqa: BLE001 - fall back to OpenAI on any provider error
            errors.append(f"gemini: {e}")

    if settings.OPENAI_API_KEY:
        try:
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                tools=tools,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return _parse(response)
        except Exception as e:  # noqa: BLE001
            errors.append(f"openai: {e}")

    detail = "; ".join(errors) if errors else "no AI provider configured (set GEMINI_API_KEY or OPENAI_API_KEY)"
    raise RuntimeError(f"AI request failed: {detail}")


def extract_json_object(text: str) -> dict:
    """Best-effort extraction of a JSON object from an LLM response.

    Handles raw JSON, ```json fenced blocks, prose surrounding a JSON object, and
    output truncated mid-object (which we repair by trimming to the last complete
    value and closing the open brackets). Returns {} if nothing is recoverable.
    """
    if not text:
        return {}
    candidate = text.strip()

    # Strip Markdown code fences if present. A truncated response may have an
    # opening ```json with no closing fence, so fall back to dropping just the
    # opening fence line in that case.
    fence = re.search(r"```(?:json)?\s*(.*?)```", candidate, re.DOTALL)
    if fence:
        candidate = fence.group(1).strip()
    else:
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate).strip()

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    if start == -1:
        return {}
    snippet = candidate[start:]

    # Try the simple first-'{' .. last-'}' window.
    end = snippet.rfind("}")
    if end != -1:
        try:
            return json.loads(snippet[:end + 1])
        except json.JSONDecodeError:
            pass

    # Last resort: salvage truncated JSON.
    return _salvage_truncated_json(snippet)


def _salvage_truncated_json(snippet: str) -> dict:
    """Recover a JSON object that was cut off mid-output.

    Trims back to the last complete object (`}`), drops any dangling comma, then
    closes the brackets the truncation left open (tracking string context so
    braces inside string values don't confuse the depth count).
    """
    cut = snippet.rfind("}")
    if cut == -1:
        return {}
    repaired = snippet[: cut + 1]

    stack: list[str] = []
    in_str = escape = False
    for ch in repaired:
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append(ch)
        elif ch == "}" and stack and stack[-1] == "{":
            stack.pop()
        elif ch == "]" and stack and stack[-1] == "[":
            stack.pop()

    for opener in reversed(stack):
        repaired += "}" if opener == "{" else "]"

    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
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

    # Generous budget: comprehensive test-case JSON plus the model's reasoning
    # tokens routinely exceed 4k; see call_ai for why this must be large.
    text = await call_ai(prompt, temperature=0.3, max_tokens=16384)
    data = extract_json_object(text)
    return data.get("testCases", [])
