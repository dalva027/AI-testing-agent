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
    target_domain = Column(String, default="http://localhost:5173")
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
