# GitHub Actions 持續整合說明

## GitHub Actions 的用途
GitHub Actions 是 GitHub 提供的自動化工作流程平台，用於在程式碼提交時自動執行建置、測試等驗證步驟，確保每一次的程式碼變更都不會破壞專案的功能。本專案的 CI（持續整合）流程會自動驗證後端與前端的程式碼品質、功能正確性，以及是否能正常建置。

## Workflow 檔案位置與觸發時機
- **Workflow 檔案位置**：`.github/workflows/ci.yml`
- **觸發時機**：
  - 當程式碼 Push 到主要分支（`main` 或 `master`）時
  - 當建立或更新指向主要分支的 Pull Request 時

## 每個 CI 工作會執行什麼

### 後端（Backend）工作
1. **環境準備**：使用 Python 3.12 版本，安裝 `uv` 套件管理工具
2. **依賴安裝**：依照 `uv.lock` 安裝鎖定版本的所有依賴套件
3. **程式碼檢查**：
   - 使用 `ruff` 執行程式碼風格與語法檢查
   - 使用 `mypy` 執行型別檢查
4. **服務容器啟動**：自動建立 MySQL 8.0 與 Redis 7 服務容器，提供隔離的測試環境
5. **資料庫準備**：執行 Alembic 資料庫遷移，建立測試所需的資料表結構
6. **測試執行**：使用 `pytest` 執行所有後端測試案例

### 前端（Frontend）工作
1. **環境準備**：使用 Node.js 20 版本
2. **依賴安裝**：依照 `package-lock.json` 安裝鎖定版本的所有 npm 依賴
3. **程式碼檢查**：
   - 使用 `oxlint` 執行程式碼風格檢查
   - 使用 TypeScript 編譯器執行型別檢查
4. **測試執行**：使用 `vitest` 執行所有前端測試案例
5. **正式建置**：執行生產環境建置，確認程式碼可以正常編譯打包

## 如何在 GitHub 網站查看執行結果與錯誤日誌
1. 前往你的 GitHub 專案頁面
2. 點擊上方的 **Actions** 分頁
3. 在左側的 Workflows 清單中選擇 **CI**
4. 點擊你想查看的執行記錄（顯示綠色 ✓ 代表成功，紅色 ✕ 代表失敗）
5. 展開對應的 job（backend 或 frontend）即可查看詳細的執行日誌
6. 如果執行失敗，日誌中會顯示具體的錯誤原因與程式碼位置

## 本機如何執行相同的測試

### 後端測試與檢查
```powershell
# 進入後端目錄
Set-Location backend

# 安裝依賴
uv sync --group dev

# 執行 ruff 檢查
uv run ruff check .

# 執行 mypy 型別檢查
uv run mypy app/

# 執行 pytest 測試（需先確保本機 MySQL 與 Redis 服務正常執行，且環境變數設定正確）
uv run pytest -q
```

### 前端測試與建置
```powershell
# 進入前端目錄
Set-Location frontend

# 安裝依賴
npm ci

# 執行 oxlint 檢查
npm run lint

# 執行型別檢查
npx tsc --noEmit

# 執行 vitest 測試
npm run test

# 執行正式建置
npm run build
```

## 必要的 Repository Secrets 或 Variables
本專案的 CI 流程**不需要任何額外的 Secrets 或 Variables**。所有測試環境所需的連線資訊、密碼等都使用 CI 專用的測試值，不會存取任何正式環境的敏感資料。

## CI 失敗時如何定位問題
1. **查看 GitHub Actions 日誌**：首先在 GitHub 的 Actions 頁面查看詳細的錯誤輸出，日誌會明確指出哪一個步驟失敗以及失敗原因
2. **分離問題來源**：
   - 如果是後端工作失敗：先確認是 lint/type check 失敗，還是測試執行失敗
   - 如果是前端工作失敗：同樣先區分是程式碼檢查、測試還是建置階段失敗
3. **本機重現問題**：依照上面的「本機如何執行相同的測試」章節，在本機執行對應的指令來重現並除錯
4. **檢查依賴更新**：如果是依賴安裝失敗，確認 `uv.lock` 或 `package-lock.json` 是否與 `pyproject.toml` / `package.json` 保持一致
5. **資料庫連線問題**：如果是後端測試中出現資料庫連線失敗，檢查本機的 MySQL 和 Redis 服務是否正常執行，以及 `.env` 檔案中的連線資訊是否正確

## 常見失敗原因
- 程式碼不符合 ruff 的語法或風格規範
- TypeScript 或 Python 型別檢查不通過
- 測試案例執行失敗（功能邏輯錯誤）
- 前端建置過程中出現匯入錯誤或語法錯誤
- 依賴套件版本不一致導致的安裝失敗