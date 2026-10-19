from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


@dataclass
class Permission:
    id: int
    name: str
    description: str | None = None


@dataclass
class Role:
    id: int
    name: str
    permissions: set[str] = field(default_factory=set)


@dataclass
class User:
    id: int
    username: str
    email: str | None
    password_hash: str
    role: UserRole = UserRole.USER
    is_active: bool = True
    permissions: set[str] = field(default_factory=lambda: {"read"})

    @property
    def role_name(self) -> str:
        return self.role.value


class UserORM(Base):
    __tablename__ = "users"
    __table_args__ = {"comment": "使用者基本資料"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="使用者主鍵編號")
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True, comment="登入帳號")
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True, comment="聯絡信箱")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False, comment="bcrypt 雜湊後密碼")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, comment="帳號是否啟用")
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id"),
        nullable=True,
        unique=True,
        index=True,
        comment="對應供應商主鍵（供應商登入帳號專用）",
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="是否須於下次登入變更密碼",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="更新時間",
    )

    role_links: Mapped[list["UserRoleORM"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class RoleORM(Base):
    __tablename__ = "roles"
    __table_args__ = {"comment": "角色定義"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="角色主鍵編號")
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True, comment="角色名稱")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="角色說明")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="更新時間",
    )

    user_links: Mapped[list["UserRoleORM"]] = relationship(back_populates="role", cascade="all, delete-orphan")
    permissions: Mapped[list["RolePermissionORM"]] = relationship(back_populates="role", cascade="all, delete-orphan")


class PermissionORM(Base):
    __tablename__ = "permissions"
    __table_args__ = {"comment": "權限項目定義"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="權限主鍵編號")
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True, comment="權限代碼")
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True, comment="權限名稱")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="權限說明")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="建立時間",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="更新時間",
    )

    role_links: Mapped[list["RolePermissionORM"]] = relationship(back_populates="permission", cascade="all, delete-orphan")


class UserRoleORM(Base):
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        {"comment": "使用者角色對應表"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="對應紀錄主鍵")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True, comment="使用者主鍵")
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False, index=True, comment="角色主鍵")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="對應建立時間",
    )

    user: Mapped[UserORM] = relationship(back_populates="role_links")
    role: Mapped[RoleORM] = relationship(back_populates="user_links")


class RolePermissionORM(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),
        {"comment": "角色權限對應表"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, comment="對應紀錄主鍵")
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False, index=True, comment="角色主鍵")
    permission_id: Mapped[int] = mapped_column(ForeignKey("permissions.id"), nullable=False, index=True, comment="權限主鍵")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="對應建立時間",
    )

    role: Mapped[RoleORM] = relationship(back_populates="permissions")
    permission: Mapped[PermissionORM] = relationship(back_populates="role_links")
