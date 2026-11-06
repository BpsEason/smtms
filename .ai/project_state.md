---
title: SMTMS 專案狀態參考
last_updated: 2026-11-04
---

# SMTMS 專案狀態文件

## 目前技術版本
- 前端版本：1.0.0
- 後端版本：1.0.0
- 部署版本：v1.0.0（Docker Compose 部署）

## 已完成模組
### 核心基礎模組
- ✅ 認證授權系統（JWT + Redis Token 撤銷）
- ✅ 使用者管理（Role/Permission 機制）
- ✅ 供應商管理
- ✅ 物料管理
- ✅ 供應商批次管理
- ✅ 收料紀錄管理
- ✅ 內部批次管理
- ✅ IQC 品質檢驗
- ✅ 稽核軌跡記錄
- ✅ CSV 匯入匯出（含公式注入防護）

## 開發中模組
- ⚠️ 不合格品完整處理流程（僅完成標記）
- ⚠️ 完整雙向追溯查詢（僅完成單向查詢）
- ⚠️ 批量操作功能
- ⚠️ 報表生成功能

## 已知問題
1. 部分邊界狀態的測試覆蓋不足
2. 批量操作缺少交易原子性保護
3. 追溯查詢僅支援單向追蹤
4. 不合格品缺少自動隔離與退廠流程
5. 部分狀態轉換缺少完整的狀態機測試

## 尚未完成項目
- 📋 生產線出料追蹤
- 📋 庫存盤點功能
- 📋 供應商績效評估
- 📋 進出口報關整合
- 📋 手機端PWA適配

## 測試現況
- 單元測試覆蓋率：約65%
- 整合測試覆蓋率：約40%
- 已覆蓋核心流程：認證、供應商建立、物料建立、批次建立、基本收料流程
- 未覆蓋區域：邊界錯誤處理、併發場景、複雜狀態轉換

## 已知架構限制
1. 後端同步Session無法直接使用async Redis操作，需要將路由改為async def
2. 前端Query Key設計過於鬆散，部分頁面的快取失效策略需要優化
3. 缺少分散式追蹤與日誌聚合
4. 資料庫連線池設定需要針對生產環境優化
5. 目前僅支援單實例部署，缺少水平擴展支援

## 後台 Layout 整合 (ProLayout)

### ProLayout 整合狀態
- 已整合 Ant Design ProComponents ProLayout 作為後台主要 Layout。
- 實作檔案：`frontend/src/components/AdminLayout.tsx`。

### AdminLayout 的責任
- 管理後台側邊選單、Header 與頁面出口（Outlet）。
- 依目前登入使用者的權限過濾導覽項目。
- 同步 React Router pathname 與 ProLayout 選中狀態。
- 呈現登入使用者名稱並提供登出按鈕。

### 導覽項目與權限過濾方式
- 導覽資料以 `navigation` 陣列集中管理，共 11 項，分為 4 個群組（工作總覽、主檔資料、進料與追溯、系統設定）。
- 權限判斷支援三種規則：`permission`（單一權限）、`permissions`（全部滿足）、`anyPermissions`（任一滿足）。
- 權限過濾後才轉為 ProLayout 的 menuData；無權限的選單不顯示。

### React Router 整合方式
- 選單項目以 `NavLink` 匯出原生選單內容，維持頁面導覽。
- 使用 `useLocation()` 取得目前 pathname，傳入 ProLayout `location` 屬性。
- 透過 `route` / `menuData` 將群組與選單項目傳入 ProLayout。

### 目前已完成與尚未完成的功能
- 已完成（代碼層面實作，未另行執行測試驗證）：
  - ProLayout 後台整合（側邊選單、群組、圖示、展開收合）。
  - React Router 與 ProLayout 選中狀態同步（useLocation）。
  - 導覽權限過濾（permission / permissions / anyPermissions）。
  - Header 顯示使用者名稱與登出按鈕。
- 尚未完成：無（依現有 AdminLayout 實作）。

### 尚未確認的問題
- 尚未執行前端測試驗證選單切換、權限過濾、Header 與登出功能；上述項目僅依程式碼實作記錄，不標記為測試通過。