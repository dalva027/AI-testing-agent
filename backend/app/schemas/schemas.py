from pydantic import BaseModel, EmailStr, Field
from typing import Any, Optional, List
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: Optional[str]
    email: str
    credits: int
    is_active: bool
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class RepoConnect(BaseModel):
    repo_id: int
    name: str
    full_name: str
    html_url: str
    owner: str
    description: Optional[str] = None
    language: Optional[str] = None
    default_branch: str = "main"


class RepoUpdate(BaseModel):
    target_domain: Optional[str] = None
    global_instruction: Optional[str] = None


class RepoOut(BaseModel):
    id: int
    user_id: int
    repo_id: int
    name: str
    full_name: str
    description: Optional[str]
    html_url: str
    owner: str
    language: Optional[str]
    default_branch: str
    target_domain: Optional[str]
    global_instruction: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class TestCaseGenerate(BaseModel):
    repo_id: int
    branch: str = "main"


class TestCaseOut(BaseModel):
    id: int
    user_id: int
    repo_id: Optional[int]
    repo_name: str
    repo_owner: str
    branch: str
    title: str
    description: str
    test_type: str
    priority: str
    target_route: Optional[str]
    target_files: Optional[List[str]]
    expected_result: Optional[str]
    playwright_script: Optional[str]
    status: str
    logs: Optional[List[str]]
    session_id: Optional[str]
    session_url: Optional[str]
    error_message: Optional[str]
    duration_ms: Optional[float]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class TestCaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_route: Optional[str] = None
    expected_result: Optional[str] = None
    playwright_script: Optional[str] = None


class TestRunRequest(BaseModel):
    test_case_ids: List[int]
    # Optional so generate_only requests can omit it. For execution, repo-linked
    # cases are guarded server-side on the repo's configured target URL; a
    # provided base_url overrides that URL for the run but never bypasses the guard.
    base_url: Optional[str] = None
    mode: str = "generate"
    custom_prompt: Optional[str] = None
    # When a run fails, regenerate the script from the failure output and re-run
    # (up to the server-side attempt cap; each attempt is charged like a run).
    heal: bool = True
    # Generate + cache the Playwright script WITHOUT executing it in a browser.
    # Ignores `mode` (always regenerates) and works without a target URL;
    # charged like a run.
    generate_only: bool = False


class TestRunResult(BaseModel):
    test_case_id: int
    status: str
    logs: List[str]
    error: Optional[str] = None
    session_id: Optional[str] = None
    session_url: Optional[str] = None
    playwright_script: Optional[str] = None
    duration_ms: Optional[float] = None
    heal_attempts: int = 0
    healed: bool = False


class TestRunOut(BaseModel):
    id: int
    test_case_id: int
    user_id: int
    status: str
    logs: List[str]
    session_id: Optional[str]
    session_url: Optional[str]
    error_message: Optional[str]
    duration_ms: Optional[float]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class TestStats(BaseModel):
    total_tests: int
    passed_tests: int
    failed_tests: int
    pending_tests: int
    pass_rate: float


class AgentTaskCreate(BaseModel):
    repo_id: int
    goal: str = Field(min_length=1, max_length=8000)
    # Hard credit ceiling for this task (LLM steps + generations + runs).
    credits_budget: int = Field(default=500, ge=10, le=2000)


class AgentMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class AgentTaskOut(BaseModel):
    id: int
    user_id: int
    repo_id: int
    goal: str
    status: str
    result: Optional[str]
    verdict: Optional[str]
    error: Optional[str]
    credits_budget: int
    credits_spent: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class AgentEventOut(BaseModel):
    id: int
    role: str
    content: Optional[str]
    tool_name: Optional[str]
    tool_args: Optional[Any]
    tool_result: Optional[Any]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class AgentTaskDetail(BaseModel):
    task: AgentTaskOut
    # Events with id > after_id (the polling cursor); ordered oldest first.
    events: List[AgentEventOut]
