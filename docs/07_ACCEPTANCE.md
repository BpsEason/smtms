# SMTMS - Acceptance Criteria (驗收標準)

## 文件資訊
- 版本：1.0.0
- 最後更新：2026-10-21
- 相關文件：[目前實作狀態](./06_CURRENT_STATE.md), [API契約](./04_API_CONTRACT.md)

---

## 驗收標準清單
保留原始ID，標註目前的自動化測試涵蓋狀態。涵蓋狀態依實際通過的測試範圍記錄；局部通過不代表完整系統驗收通過。

| #   | 驗收條件                    | 前置條件                                 | 操作步驟                                                        | 預期結果                                                       | 測試涵蓋 |
| --- | --------------------------- | ---------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| A1  | 正確登入                    | 存在啟用中帳號                           | 以正確帳密呼叫 `POST /auth/login`                               | 200，回`access_token`、`token_type=bearer`                    | 是       |
| A2  | 錯誤登入被拒                | 同上                                     | 以錯誤密碼呼叫登入                                              | 401 `Invalid username or password`                             | 是       |
| A3  | 停用帳號無法登入            | 存在`is_active=false`帳號                | 以正確密碼登入                                                  | 401                                                            | 是       |
| A4  | 未帶／無效／過期Token被拒 | —                                        | 呼叫`GET /auth/me`                                             | 401                                                            | 是       |
| A5  | 登出後Token失效           | 已登入                                   | 登出後再呼叫`GET /auth/me`                                     | 401，且Redis有撤銷鍵                                         | 是       |
| A6  | 無權限使用者被拒            | 具read權限角色                         | 以該帳號`POST /suppliers`                                      | 403                                                            | 是       |
| A7  | `seed:`權限正規化          | 角色權限為`seed:suppliers:read`         | `GET /auth/me`後存取`GET /suppliers`                          | `/me`權限顯示`suppliers:read`；存取200                      | 是       |
| A8  | 管理員依實際權限存取        | `seed_admin`具全部權限                  | 檢查種子管理員角色權限；以測試管理員帳號呼叫角色／使用者／權限 API | 種子管理員角色具有全部種子權限；測試管理員的存取依角色授權     | 自動化部分通過（驗證角色完整權限及管理 API；未以`seed_admin`登入或逐一呼叫所有受保護端點） |
| A9  | 供應商基本操作              | 具`suppliers:write`                     | 建立→查詢→更新→關鍵字搜尋分頁                                   | 201／200；重複代碼409；不存在404                             | 是       |
| A10 | 供應商資格文件查詢          | 存在文件資料                             | `GET /suppliers/{id}/documents`                                 | 200清單                                                       | 是       |
| A11 | 物料基本操作                | 具`materials:write`                     | 建立→查詢→更新→搜尋分頁                                         | 201／200；重複代碼409；不存在404                             | 是       |
| A12 | 供貨關聯與首選              | 具`suppliers:write`                     | 建立關聯（`is_preferred=true`）→查物料供應商→刪除            | 201／200／204；重複409；同物料僅1筆首選                     | 是       |
| A13 | 收料建立與查詢              | 已存在供應商、物料、供應商批次與供貨關聯 | `POST /receipts`→`GET /receipts`／`{id}`；查詢不存在ID        | 201，`qty_remaining=qty_received`；清單可見；不存在明細404     | 自動化通過（建立、清單、明細及明細404） |
| A14 | 收料一致性限制              | 存在不符合之供應商／物料／批次           | 送出與收料供應商不符的`supplier_lot_id`                         | 400                                                            | 自動化通過（供應商與供應商批次不符） |
| A15 | 供貨關聯缺失                | 供應商未與物料建立關聯                   | 送出收料                                                        | 400「Supplier is not linked to the material」                  | 自動化通過 |
| A16 | 批次拆分數量限制            | 存在收料且有剩餘量                       | 拆分量 > `qty_remaining`；或重複`internal_lot_no`；或`qty<=0` | 400／409／400                                                  | 自動化部分通過（超量400、重複批號409；`qty<=0` 未單獨驗證） |
| A17 | IQC建立                    | 存在內部批次                             | `POST /iqc`（passed/released）                                  | 201，`inspector_user_id`為登入者，批次`lot_status=available` | 自動化通過（建立及登入者／批次狀態斷言） |
| A18 | IQC查詢與更新              | 存在IQC記錄                            | `GET /iqc`、`GET /iqc/{id}`、`PATCH /iqc/{id}`                  | 200；更新後結果／狀態變更                                      | 自動化通過（清單篩選、明細、更新及不存在明細404） |
| A19 | IQC結果與放行配對          | —                                        | 送出`passed` + `hold`等不符組合                               | 422（Schema）或400                                            | 是（Schema層） |
| A20 | 不存在的資料處理            | —                                        | 以不存在ID呼叫各明細端點                                      | 404                                                            | 是（供應商／物料）；其餘部分否 |
| A21 | 重複資料處理                | —                                        | 重複代碼／單號／批號                                            | 409                                                            | 部分      |
| A22 | DB異常行為                 | DB 健康檢查依賴發生連線例外（測試以 mock 注入） | 呼叫`health/database`、`health/ready`及`health/live`           | DB 回報`unavailable`、ready 為`degraded`，live 仍可用；受保護端點 DB 故障回應未驗 | 自動化部分通過（健康檢查例外與存活狀態；未使用真實 MySQL 中斷） |
| A23 | Redis異常行為              | Redis 操作發生連線例外（測試以 mock 注入） | 使用有效 Token 呼叫`GET /auth/me`及健康檢查                    | 回503 `Authentication service unavailable`（不放行）；ready 為`degraded`、live 仍可用 | 自動化通過（mock Redis 故障；未使用真實 Redis 中斷） |
| A24 | 健康檢查端點可用            | 服務啟動                                 | 呼叫`/api/v1/health`、`/live`、`/ready`、`/database`、`/redis` | 200且含`status`                                              | 是（僅斷言鍵存在） |
| A25 | 前端建置                    | 已安裝依賴                               | `npm run build`                                                 | 建置成功                                                       | 本次通過 |
| A26 | 前端主要頁面操作            | 已安裝依賴                               | 登入→收料建立→拆分→IQC                                          | 流程完成並顯示後端確認狀態                                     | 是（`App.test.tsx`，以mock API） |
| A27 | 稽核紀錄查詢與唯讀明細 | 帳號具`audit:read` | 篩選操作者/操作/資源/時間，分頁並檢視異動前後 | 僅授權使用者可查詢；資料唯讀且明細正確 | 自動化部分通過（前端篩選、分頁、明細測試；後端權限整合測試受 Windows TestClient 環境限制未完成） |
| A28 | 稽核紀錄 CSV 匯出 | 帳號具`audit:read` | 以篩選條件匯出全部匹配紀錄 | 欄位含異動前後；特殊字元正確跳脫、公式內容中和、大量資料分批串流 | 自動化部分通過（前端匯出呼叫、後端 CSV quoting/公式注入單元測試；HTTP 串流整合未完成） |

---

## 本次實際執行之測試結果
| 項目     | 命令                                          | 結果                                                              |
| -------- | --------------------------------------------- | ----------------------------------------------------------------- |
| 後端驗收相關測試 | `pytest -q tests/test_quality_workflow_api.py tests/test_infrastructure.py tests/test_jwt_rbac.py tests/test_access_control_api.py tests/test_seed_dev.py::test_seed_administrator_has_every_seeded_permission`（於`backend/`） | **42 項中 1 項略過，其餘通過**，exit code 0；略過項目需專用 MySQL 測試資料庫 |
| 前端測試 | `npm test`（於`frontend/`，即`vitest run`） | **32 passed**（5 個測試檔），exit code 0 |
| Audit Log 前端測試 | `npm test -- --run src/pages/AuditLogPage.test.tsx`（於`frontend/`） | **3 passed**，含篩選、分頁、明細及 CSV 匯出 |
| Audit Log 後端單元測試 | `pytest -q tests/test_audit_api.py::test_audit_csv_export_quotes_content_and_neutralizes_formula_injection tests/test_audit_api.py::test_audit_commit_rolls_back_with_business_change_and_secrets_are_filtered`（於`backend/`） | **2 passed**；CSV 公式注入/引號、交易回滾與敏感欄位遮蔽 |
| 前端 production build | `npm run build`（於`frontend/`） | **本次通過** |
| 差異檢查 | `git diff --check`（工作區） | **通過** |

> 後端測試使用記憶體 SQLite 與假 Redis；外部故障測試以 mock 注入例外，並非實際中斷 MySQL／Redis。前端測試使用 mock API。為完成 Starlette `TestClient` 測試，需允許本機 loopback socket；沙箱限制 loopback 時，AnyIO／Windows asyncio socket 建立會停滯，允許後測試完成。前端長流程測試超過 Vitest 預設 5 秒，僅將該既有測試逾時設為 15 秒後通過。本次已執行前端 production build。未在真實 MySQL／Redis 或 Docker Compose 環境執行。

> Audit Log API 權限與串流端點未能在本機 Windows TestClient 環境完成端對端請求；已分別以交易/CSV 單元測試及 mock API 的前端測試驗證核心行為。大量資料實際串流吞吐及 MySQL cursor 行為仍待整合環境驗收。

---

## 待驗證項目清單（需人工確認）
以下為自動化測試尚未涵蓋的完整範圍或環境限制，不代表已測試部分失敗：
1. A8：以實際 `seed_admin` 帳號登入，逐一存取所有受保護端點；目前種子測試驗證其角色具全部種子權限，管理 API 測試則使用獨立測試管理員帳號。
2. A16：`qty<=0` 的拆分錯誤分支尚未單獨驗證；超量及重複批號分支已通過自動化測試。
3. A22：使用真實 MySQL 中斷驗證，以及 DB 故障期間受保護端點的實際回應；目前僅以 mock 例外驗證健康檢查與 liveness。
4. A23：使用真實 Redis 中斷驗證；目前以 mock 例外驗證有效 Token 的受保護端點回503及健康狀態。
5. MySQL 管理員併發測試需提供專用測試資料庫後執行；目前因未設定 `SMTMS_TEST_MYSQL_URL` 而略過。真實 MySQL／Redis 與 Docker Compose 整合情境尚未驗證。
