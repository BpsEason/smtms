---
title: SMTMS 技術架構參考
last_verified: 2026-11-04
---

# SMTMS 技術架構文件

## 前後端架構
### 前端架構
- React 19 + TypeScript + Vite 8
- 狀態管理：TanStack Query (React Query) 處理遠端資料
- 路由：React Router 7
- CSS：Tailwind CSS 4
- 表單處理：React Hook Form + Zod
- 套件版本：@tanstack/react-query@5.105.0, react-hook-form@7.91.0, zod@4.6.7

### 後端架構
- Python 3.12+ + FastAPI
- 資料庫 ORM：SQLAlchemy 2
- 資料驗證：Pydantic 2
- 遷移工具：Alembic
- WSGI：Uvicorn
- 套件版本：redis@5.0.0, PyJWT@2.8.0, bcrypt@4.1.2

## 目錄結構
```
backend/                 # FastAPI 後端
  app/api/routes/         # API 路由 (auth.py, suppliers.py, materials.py, quality.py...)
  app/models/             # SQLAlchemy 模型
  app/services/           # 業務服務 (audit.py, auth.py...)
  app/core/               # 核心功能 (security.py...)
  tests/                  # 後端測試
frontend/                # React/TypeScript 前端
  src/pages/              # 頁面元件
  src/api/                # API 客戶端
docker/nginx/            # Nginx 設定
docker-compose.yml       # 容器编排
docs/                    # 正式文件
.ai/                     # AI Coding Context 文件
  SKILL.md                # AI Agent 主要規範
  architecture.md         # 技術架構詳細
  business_rules.md       # 業務規則詳細
  project_state.md        # 專案狀態詳細
  task_template.md        # 任務執行模板
```

## 核心業務模組檔案對照表
快速定位各模組的主要相關檔案，避免重複搜尋：

### 供應商管理模組 (Suppliers)
- 路由：`backend/app/api/routes/suppliers.py`
- 模型：`backend/app/models/quality.py` (SupplierORM, SupplierMaterialORM)
- 測試：`tests/test_suppliers_api.py`、`tests/test_access_control_api.py`
- 相關服務：`supplier_import.py`（匯入功能）、`document_storage.py`（文件存儲）

### 物料管理模組 (Materials)
- 路由：`backend/app/api/routes/materials.py`
- 模型：`backend/app/models/quality.py` (MaterialORM)
- 測試：`tests/test_materials_api.py`

### 品質流程模組 (Quality)
- 路由：`backend/app/api/routes/quality.py`
- 模型：`backend/app/models/quality.py` (所有品質相關ORM)
- 測試：`tests/test_quality_api.py`、`tests/test_split_lots.py`

### 認證授權模組 (Auth)
- 路由：`backend/app/api/routes/auth.py`
- 核心邏輯：`backend/app/core/security.py`
- 測試：`tests/test_auth.py`、`tests/test_permissions.py`

### 稽核軌跡模組 (Audit)
- 路由：`backend/app/api/routes/audit.py`
- 服務：`backend/app/services/audit.py`
- 前端頁面：`frontend/src/pages/AuditLogPage.tsx`

## API 呼叫流程
```
Browser → Nginx → FastAPI Backend → MySQL/Redis
```
- Nginx 反向代理 :8087 轉發到前端容器 :5173 和後端容器 :8000
- 所有 API 請求攜帶 JWT Token 進行認證
- Token 撤銷機制透過 Redis 實現

## 認證與授權
- 認證機制：JWT + Redis Token 撤銷
- 權限檢查依賴注入：
  - `require_permission("permission.code")`：檢查使用者是否擁有特定權限
  - `require_role("admin")`：檢查使用者是否擁有特定角色
  - `get_current_user()`：取得目前認證的使用者資訊
- 供應商資料隔離：`ensure_supplier_access(current_user, supplier_id)`

## 資料存取模式
- 後端統一使用 SQLAlchemy ORM 進行資料庫操作
- 所有資源查詢都有內建的供應商過濾機制（如果是供應商帳號）
- 分頁查詢統一使用 `page` 和 `page_size` 參數，返回 `PaginatedResponse` 格式

## 交易邊界
- 單一資料庫操作：依賴 FastAPI 自動管理 Session 生命週期
- 複雜原子操作：使用 `with db.begin():` 明確界定交易範圍
- 併發控制：關鍵操作使用 MySQL advisory lock（參考 access.py）

## 部署架構
- Docker Compose 管理 Redis、前端、後端、Nginx
- MySQL 8 為外部資料庫，不由 Docker 管理
- 開發環境：前端 Vite dev server、後端 Uvicorn reload 模式

## 代表性程式碼參考位置
- 前端列表頁範例：[CatalogPages.tsx](file:///c:/laragon/www/smtms/frontend/src/pages/CatalogPages.tsx)
- 後端品質流程路由：[quality.py](file:///c:/laragon/www/smtms/backend/app/api/routes/quality.py)
- API 客戶端實作：[client.ts](file:///c:/laragon/www/smtms/frontend/src/api/client.ts)
- 權限核心邏輯：[security.py](file:///c:/laragon/www/smtms/backend/app/core/security.py)