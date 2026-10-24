# SMTMS - Architecture Decision Records (技術決策記錄)

## 文件資訊
- 版本：1.0.0
- 最後更新：2026-10-20
- 相關文件：[SRS](./01_SRS.md), [資料庫結構](./05_DATABASE_SCHEMA.md)

---

## ADR-001：後端框架選擇 FastAPI
- **決策日期**：2026-Q4
- **選擇方案**：FastAPI + Uvicorn
- **放棄方案**：Django、Flask、NestJS
- **決策理由**：TBD（原始文件未記錄選擇理由）
- **現況**：✅ 已採用，版本`fastapi>=0.115.0,<1.0.0`
- **實作位置**：`backend/pyproject.toml`, `backend/app/main.py`

## ADR-002：ORM選擇 SQLAlchemy 2.x
- **決策日期**：2026-Q4
- **選擇方案**：SQLAlchemy 2.0 + Alembic 遷移工具
- **放棄方案**：Peewee、Prisma、原始SQL
- **決策理由**：TBD
- **現況**：✅ 已採用，SQLAlchemy版本`>=2.0.0,<3.0.0`、Alembic`>=1.14.0,<2.0.0`
- **實作位置**：`backend/pyproject.toml`, `backend/app/db/`

## ADR-003：資料庫選擇 MySQL
- **決策日期**：2026-Q4
- **選擇方案**：MySQL 8.x + PyMySQL 連接器
- **放棄方案**：PostgreSQL、SQLite
- **決策理由**：TBD
- **現況**：✅ 已採用，MySQL為外部資料庫，Compose不管理
- **實作位置**：`backend/pyproject.toml`, `docker-compose.yml`
- **連線設定**：`pool_pre_ping=True`、`future=True`，Session設定`autocommit=False, autoflush=False`

## ADR-004：快取/會話儲存選擇 Redis
- **決策日期**：2026-Q4
- **選擇方案**：Redis 7
- **用途**：
  - Token撤銷名單：`auth:revoked:{jti}`
  - 健康檢查：`PING`
- **放棄方案**：資料庫存撤銷名單、JWT無狀態無撤銷
- **決策理由**：TBD
- **現況**：✅ 已採用，redis-py版本`>=5.0.0,<6.0.0`
- **實作位置**：`backend/app/core/redis_client.py`

## ADR-005：認證方式選擇 JWT
- **決策日期**：2026-Q4
- **選擇方案**：PyJWT + HS256演算法
- **Token設定**：
  - 有效期：60分鐘
  - 簽章金鑰長度：最少32字元
- **放棄方案**：OAuth2、Session Cookies
- **決策理由**：TBD
- **現況**：✅ 已採用，PyJWT版本`>=2.8.0,<3.0.0`
- **實作位置**：`backend/app/core/security.py`

## ADR-006：密碼加密選擇 bcrypt
- **決策日期**：2026-Q4
- **選擇方案**：bcrypt + passlib[bcrypt]
- **放棄方案**：MD5、SHA系列直接雜湊
- **決策理由**：TBD
- **現況**：✅ 已採用
- **實作位置**：認證流程中使用

## ADR-007：前端框架選擇 React 19 + TypeScript
- **決策日期**：2026-Q4
- **選擇方案**：React 19 + TypeScript + Vite
- **UI元件**：Radix UI、Tailwind CSS 4
- **路由**：React Router v7
- **放棄方案**：Vue.js、Next.js、Angular
- **決策理由**：TBD
- **現況**：✅ 已採用
- **實作位置**：`frontend/package.json`

## ADR-008：部署架構選擇 Docker Compose
- **決策日期**：2026-Q4
- **選擇方案**：Docker Compose + Nginx 反向代理
- **服務配置**：
  - redis:7-alpine
  - backend: 自建映像
  - frontend: 自建映像
  - nginx:alpine
- **網路**：自定義bridge網路`smtms-net`
- **放棄方案**：Kubernetes、單一容器部署
- **決策理由**：TBD
- **現況**：✅ 已採用
- **實作位置**：`docker-compose.yml`, `docker/nginx/default.conf`

## ADR-009：Nginx路由規則
- **決策日期**：2026-Q4
- **規則**：
  - `/api/` → 轉發backend:8000（路徑不重寫）
  - `/docs`、`/openapi.json` → 轉發後端Swagger UI
  - 所有其他路徑 → 轉發前端服務
- **支援**：WebSocket Upgrade（Vite HMR）
- **現況**：✅ 已實作
- **已知問題**：`/health/`尾斜線路由依賴FastAPI重導，參見[目前實作狀態](./06_CURRENT_STATE.md)中的D5

## ADR-010：測試策略
- **決策日期**：2026-Q4
- **後端測試**：pytest + fastapi.testclient + 記憶體SQLite + FakeRedis
- **前端測試**：vitest + Testing Library + fetch mock
- **原則**：所有測試不依賴外部服務，可獨立執行
- **現況**：✅ 已實作
- **實作位置**：`backend/tests/`, `frontend/tests/App.test.tsx`

---

## 待確認技術決策 (TBD)

### ADR-TBD-001：是否考慮未來遷移至PostgreSQL？
### ADR-TBD-002：是否規劃導入外部物件儲存(S3)處理檔案上傳？
### ADR-TBD-003：是否計劃實現檔案病毒掃描機制？
### ADR-TBD-004：CI流程是否需要完整執行前端typecheck和build？