from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)
    github_access_token = Column(String, nullable=True)
    github_user_id = Column(String, nullable=True)
    github_username = Column(String, nullable=True)
    credits = Column(Integer, default=1000)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    repo_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    html_url = Column(String, nullable=False)
    owner = Column(String, nullable=False)
    language = Column(String, nullable=True)
    default_branch = Column(String, default="main")
    is_private = Column(Integer, default=0)
    # NULL until the user explicitly sets it; test execution is blocked while
    # unset (generation stays allowed). No silent localhost default.
    target_domain = Column(String, nullable=True)
    global_instruction = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    repo_id = Column(Integer, ForeignKey("repositories.id"), nullable=True)
    repo_name = Column(String, nullable=False)
    repo_owner = Column(String, nullable=False)
    branch = Column(String, default="main")

    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    test_type = Column(String(100), nullable=False)
    priority = Column(String(50), nullable=False)

    target_route = Column(String(500), nullable=True)
    target_files = Column(JSONB, default=list)
    expected_result = Column(Text, nullable=True)

    playwright_script = Column(Text, nullable=True)
    status = Column(String(100), default="generated")
    logs = Column(JSONB, default=list)
    session_id = Column(String(255), nullable=True)
    session_url = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Numeric, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(Integer, primary_key=True, index=True)
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), nullable=False)
    logs = Column(JSONB, default=list)
    session_id = Column(String(255), nullable=True)
    session_url = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Numeric, nullable=True)
    playwright_script_used = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AgentTask(Base):
    """One assignment given to the AI agent ("test the checkout flow and report").

    The agent runs as a background tool-calling loop; this row is its durable
    job record. status: queued | running | awaiting_input | completed | failed |
    cancelled | stale (interrupted by a restart; resumable by sending a message).
    """

    __tablename__ = "agent_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    repo_id = Column(Integer, ForeignKey("repositories.id"), nullable=False)
    goal = Column(Text, nullable=False)
    status = Column(String(50), default="queued", index=True)
    result = Column(Text, nullable=True)
    verdict = Column(String(50), nullable=True)
    error = Column(Text, nullable=True)
    credits_budget = Column(Integer, default=500)
    credits_spent = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AgentEvent(Base):
    """One step of an agent task: chat transcript and audit log in one.

    Doubles as the persisted conversation state — the loop is rebuilt from these
    rows after a pause (ask_user) or a server restart, so nothing lives only in
    memory. roles: user | assistant | tool | system (in-conversation notes) |
    progress (display-only, excluded from the rebuilt LLM conversation).
    """

    __tablename__ = "agent_events"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("agent_tasks.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=True)
    tool_name = Column(String(100), nullable=True)
    tool_call_id = Column(String(100), nullable=True)
    # Raw OpenAI-format tool_calls list on assistant events (replayed verbatim).
    tool_calls = Column(JSONB, nullable=True)
    # Parsed args / result payload on tool events (what the UI renders).
    tool_args = Column(JSONB, nullable=True)
    tool_result = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
