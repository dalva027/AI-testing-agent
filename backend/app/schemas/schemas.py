from pydantic import BaseModel, EmailStr
from typing import Optional, List
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
    base_url: str
    mode: str = "generate"
    custom_prompt: Optional[str] = None


class TestRunResult(BaseModel):
    test_case_id: int
    status: str
    logs: List[str]
    error: Optional[str] = None
    session_id: Optional[str] = None
    session_url: Optional[str] = None
    playwright_script: Optional[str] = None
    duration_ms: Optional[float] = None


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
