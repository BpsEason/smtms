# SMTMS - Acceptance Criteria (驗收標準)

## 文件資訊
- 版本：1.0.0
- 最後更新：2026-10-20
- 相關文件：[目前實作狀態](./06_CURRENT_STATE.md), [API契約](./04_API_CONTRACT.md)

---

## 驗收標準清單
保留原始ID，標註目前的自動化測試涵蓋狀態。`測試涵蓋`="是"代表有自動化測試通過；"否"代表需人工驗證。

| #   | 驗收條件                    | 前置條件                                 | 操作步驟                                                        | 預期結果                                                       | 測試涵蓋 |
| --- | --------------------------- | ---------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| A1  | 正確登入                    | 存在啟用中帳號                           | 以正確帳密呼叫 `POST /auth/login`                               | 200，回`access_token`、`token_type=bearer`                    | 是       |
| A2  | 錯誤登入被拒                | 同上                                     | 以錯誤密碼呼叫登入                                              | 401 `Invalid username or password`                             | 是       |
| A3  | 停用帳號無法登入            | 存在`is_active=false`帳號                | 以正確密碼登入                                                  | 401                                                            | 是       |
| A4  | 未帶／無效／過期Token被拒 | —                                        | 呼叫`GET /auth/me`                                             | 401                                                            | 是       |
| A5  | 登出後Token失效           | 已登入                                   | 登出後再呼叫`GET /auth/me`                                     | 401，且Redis有撤銷鍵                                         | 是       |
| A6  | 無權限使用者被拒            | 具read權限角色                         | 以該帳號`POST /suppliers`                                      | 403                                                            | 是       |
| A7  | `seed:`權限正規化          | 角色權限為`seed:suppliers:read`         | `GET /auth/me`後存取`GET /suppliers`                          | `/me`權限顯示`suppliers:read`；存取200                      | 是       |
| A8  | 管理員依實際權限存取        | `seed_admin`具全部權限                  | 呼叫各受保護端點                                                | 皆200／201（依實際授權）                                      | 否       |
| A9  | 供應商基本操作              | 具`suppliers:write`                     | 建立→查詢→更新→關鍵字搜尋分頁                                   | 201／200；重複代碼409；不存在404                             | 是       |
| A10 | 供應商資格文件查詢          | 存在文件資料                             | `GET /suppliers/{id}/documents`                                 | 200清單                                                       | 是       |
| A11 | 物料基本操作                | 具`materials:write`                     | 建立→查詢→更新→搜尋分頁                                         | 201／200；重複代碼409；不存在404                             | 是       |
| A12 | 供貨關聯與首選              | 具`suppliers:write`                     | 建立關聯（`is_preferred=true`）→查物料供應商→刪除            | 201／200／204；重複409；同物料僅1筆首選                     | 是       |
| A13 | 收料建立與查詢              | 已存在供應商、物料、供應商批次與供貨關聯 | `POST /receipts`→`GET /receipts`／`{id}`                      | 201，`qty_remaining=qty_received`；清單可見                    | 是（建立）；404分支否 |
| A14 | 收料一致性限制              | 存在不符合之供應商／物料／批次           | 送出不符的`supplier_lot_id`                                    | 400                                                            | 否       |
| A15 | 供貨關聯缺失                | 供應商未與物料建立關聯                   | 送出收料                                                        | 400「Supplier is not linked to the material」                  | 否       |
| A16 | 批次拆分數量限制            | 存在收料且有剩餘量                       | 拆分量 > `qty_remaining`；或重複`internal_lot_no`；或`qty<=0` | 400／409／400                                                  | 部分（成功案例是；超量／重複否） |
| A17 | IQC建立                    | 存在內部批次                             | `POST /iqc`（passed/released）                                  | 201，`inspector_user_id`為登入者，批次`lot_status=available` | 是       |
| A18 | IQC查詢與更新              | 存在IQC記錄                            | `GET /iqc`、`GET /iqc/{id}`、`PATCH /iqc/{id}`                  | 200；更新後結果／狀態變更                                      | 是（更新是；`GET /iqc/{id}`否） |
| A19 | IQC結果與放行配對          | —                                        | 送出`passed` + `hold`等不符組合                               | 422（Schema）或400                                            | 是（Schema層） |
| A20 | 不存在的資料處理            | —                                        | 以不存在ID呼叫各明細端點                                      | 404                                                            | 是（供應商／物料）；其餘部分否 |
| A21 | 重複資料處理                | —                                        | 重複代碼／單號／批號                                            | 409                                                            | 部分      |
| A22 | DB異常行為                 | MySQL不可用                             | 呼叫受保護端點／`health/database`                               | 端點可能5xx；健康檢查回`unavailable`                         | 否       |
| A23 | Redis異常行為              | Redis不可用                             | 呼叫受保護端點                                                  | 503 `Authentication service unavailable`（不放行）             | 否       |
| A24 | 健康檢查端點可用            | 服務啟動                                 | 呼叫`/api/v1/health`、`/live`、`/ready`、`/database`、`/redis` | 200且含`status`                                              | 是（僅斷言鍵存在） |
| A25 | 前端建置                    | 已安裝依賴                               | `npm run build`                                                 | 建置成功                                                       | 否       |
| A26 | 前端主要頁面操作            | 已安裝依賴                               | 登入→收料建立→拆分→IQC                                          | 流程完成並顯示後端確認狀態                                     | 是（`App.test.tsx`，以mock API） |

---

## 本次實際執行之測試結果
| 項目     | 命令                                          | 結果                                                              |
| -------- | --------------------------------------------- | ----------------------------------------------------------------- |
| 後端測試 | `uv run pytest -q`（於`backend/`）           | **17 passed**，exit code 0（僅1筆StarletteDeprecationWarning） |
| 前端測試 | `npm test`（於`frontend/`，即`vitest run`） | **2 passed**（1個測試檔），exit code 0                           |

> 上述測試皆使用記憶體SQLite與假Redis／mock fetch，**未**在真實MySQL／Redis或Docker Compose環境執行；未執行`npm run build`。

---

## 待驗證項目清單（需人工確認）
以下項目目前缺少自動化測試，需進行人工驗證：
1. A8: 管理員全權限存取
2. A13: 收料明細查詢的404處理
3. A14-A15: 收料一致性錯誤處理
4. A16: 拆分超量、重複批號的錯誤處理
5. A18: IQC明細查詢
6. A22-A23: 外部服務中斷的容錯行為
7. A25: 前端生產建置