import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NonconformancePage } from "../../src/pages/NonconformancePage";
import type { UserProfile } from "../../src/types";

const fetchMock = vi.fn();
const profile: UserProfile = { id: 4, username: "qa", email: null, is_active: true, roles: ["qa"], permissions: ["nonconformance:read", "nonconformance:write"] };
const record = { id: 1, case_no: "NC-100", title: "Surface crack", description: "Found on incoming material", source: "iqc", severity: "high", status: "investigating", found_at: "2026-10-20T10:00:00Z", found_by_user_id: 4, owner_user_id: 4, supplier_id: 2, material_id: 3, receipt_id: 5, supplier_lot_id: 6, internal_lot_id: 7, iqc_record_id: 8, defect_qty: "2", investigation: "Lot review", closed_at: null, created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z", dispositions: [], history: [], attachments: [] };

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/nonconformances/1")) return response(record);
    if (url.includes("/api/v1/nonconformances")) return response({ items: [record], total: 1, page: 1, page_size: 20 });
    return response({ detail: "unexpected" });
  });
});

describe("NonconformancePage", () => {
  it("loads a case list and shows the selected case detail and history panel", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "NC-100" }));
    expect(await screen.findByText("NC-100 · Surface crack", { selector: "h2" })).toBeTruthy();
    // 使用getByDisplayValue來檢查textarea中的值，因為RHF會將值綁定到表單元素上
    const investigationTextarea = screen.getByLabelText("調查內容");
    expect(investigationTextarea).toHaveValue("Lot review");
    expect(screen.getByText("案件歷程")).toBeTruthy();
  });

  it("offers creation only to a user with write permission", async () => {
    render(<MemoryRouter><NonconformancePage profile={{ ...profile, permissions: ["nonconformance:read"] }} /></MemoryRouter>);
    expect(await screen.findByText("NC-100")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "新增案件" })).toBeNull();
  });

  it("submits the new case form to the API", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/v1/nonconformances") && init?.method === "POST") return response(record, 201);
      if (String(input).endsWith("/api/v1/nonconformances/1")) return response(record);
      return response({ items: [record], total: 1, page: 1, page_size: 20 });
    });
    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "新增案件" }));
    await user.type(screen.getByLabelText("異常編號"), "NC-NEW");
    await user.type(screen.getByLabelText("標題"), "Surface crack");
    await user.type(screen.getByLabelText("異常描述"), "Found in incoming inspection");
    await user.click(screen.getByRole("button", { name: "建立案件" }));
    expect(await screen.findByRole("heading", { name: "NC-100 · Surface crack" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/nonconformances"), expect.objectContaining({ method: "POST" }));
  });

  it("shows a readable API error when the case list cannot load", async () => {
    fetchMock.mockImplementation(async () => response({ detail: "Missing permissions: nonconformance:read" }, 403));
    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Missing permissions: nonconformance:read");
    expect(screen.queryByText("目前沒有符合條件的案件。")).toBeNull();
  });

  it("prevents closing a case when investigation or dispositions are missing", async () => {
    const user = userEvent.setup();
    // Mock a case in pending_confirmation state without investigation or dispositions
    const pendingRecord = { 
      ...record, 
      status: "pending_confirmation",
      investigation: "",
      dispositions: []
    };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/nonconformances/1")) return response(pendingRecord);
      if (url.includes("/api/v1/nonconformances")) return response({ items: [pendingRecord], total: 1, page: 1, page_size: 20 });
      return response({ detail: "unexpected" });
    });

    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "NC-100" }));
    
    // 檢查結案按鈕是否被禁用
    const closeButton = screen.getByRole("button", { name: "結案" });
    expect(closeButton).toBeDisabled();
    
    // 檢查是否顯示提示訊息
    expect(await screen.findByText("請先填寫調查內容；請先新增至少一筆處置記錄；完成後才能結案")).toBeTruthy();
  });

  it("allows closing a case when all requirements are met", async () => {
    const user = userEvent.setup();
    // Mock a case in pending_confirmation state with all required data
    const readyRecord = { 
      ...record, 
      status: "pending_confirmation",
      investigation: "Complete investigation findings",
      dispositions: [{ id: 1, content: "Rework process applied", result: "Pass", owner_user_id: 4, executed_at: "2026-10-21T10:00:00Z" }]
    };
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/nonconformances/1") && init?.method === "PATCH") {
        return response({ ...readyRecord, status: "closed" });
      }
      if (url.endsWith("/api/v1/nonconformances/1")) return response(readyRecord);
      if (url.includes("/api/v1/nonconformances")) return response({ items: [readyRecord], total: 1, page: 1, page_size: 20 });
      return response({ detail: "unexpected" });
    });

    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "NC-100" }));
    
    // 檢查結案按鈕是否啟用
    const closeButton = screen.getByRole("button", { name: "結案" });
    expect(closeButton).not.toBeDisabled();
    
    // 嘗試點擊結案按鈕
    await user.click(closeButton);
    
    // 驗證API是否被呼叫
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/nonconformances/1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

describe("NonconformancePage numeric field validation", () => {
  it("allows ID fields to be empty and converts to null in API payload", async () => {
    const user = userEvent.setup();
    let submittedData: Record<string, unknown> | null = null;
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/v1/nonconformances") && init?.method === "POST") {
        submittedData = JSON.parse(init.body as string);
        return response(record, 201);
      }
      if (String(input).endsWith("/api/v1/nonconformances/1")) return response(record);
      return response({ items: [record], total: 1, page: 1, page_size: 20 });
    });

    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "新增案件" }));
    
    // 填寫必填欄位，所有ID欄位保持空白
    await user.type(screen.getByLabelText("異常編號"), "NC-NEW");
    await user.type(screen.getByLabelText("標題"), "Surface crack");
    await user.type(screen.getByLabelText("異常描述"), "Found in incoming inspection");
    
    // 送出表單
    await user.click(screen.getByRole("button", { name: "建立案件" }));
    
    // 驗證API被呼叫
    expect(fetchMock).toHaveBeenCalled();
    // 驗證所有ID欄位都被轉換為null
    expect(submittedData?.supplier_id).toBeNull();
    expect(submittedData?.material_id).toBeNull();
    expect(submittedData?.receipt_id).toBeNull();
    expect(submittedData?.defect_qty).toBeNull();
  });

  it("shows validation errors for invalid ID field values and prevents API call", async () => {
    const user = userEvent.setup();
    let postCalled = false;
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/v1/nonconformances") && init?.method === "POST") {
        postCalled = true;
      }
      if (String(input).endsWith("/api/v1/nonconformances/1")) return response(record);
      return response({ items: [record], total: 1, page: 1, page_size: 20 });
    });

    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "新增案件" }));
    
    // 填寫必填欄位
    await user.type(screen.getByLabelText("異常編號"), "NC-NEW");
    await user.type(screen.getByLabelText("標題"), "Surface crack");
    await user.type(screen.getByLabelText("異常描述"), "Found in incoming inspection");
    
    // 輸入無效的供應商ID值（0）
    await user.type(screen.getByLabelText("供應商 ID（可選）"), "0");
    
    // 送出表單
    await user.click(screen.getByRole("button", { name: "建立案件" }));
    
    // 驗證驗證錯誤出現
    expect(await screen.findByText("必須是有效的正整數")).toBeTruthy();
    // 驗證API沒有被呼叫
    expect(postCalled).toBe(false);
  });

  it("accepts valid positive integer ID and submits successfully", async () => {
    const user = userEvent.setup();
    let submittedData: Record<string, unknown> | null = null;
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/v1/nonconformances") && init?.method === "POST") {
        submittedData = JSON.parse(init.body as string);
        return response(record, 201);
      }
      if (String(input).endsWith("/api/v1/nonconformances/1")) return response(record);
      return response({ items: [record], total: 1, page: 1, page_size: 20 });
    });

    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "新增案件" }));
    
    // 填寫必填欄位和有效的供應商ID
    await user.type(screen.getByLabelText("異常編號"), "NC-NEW");
    await user.type(screen.getByLabelText("標題"), "Surface crack");
    await user.type(screen.getByLabelText("異常描述"), "Found in incoming inspection");
    await user.type(screen.getByLabelText("供應商 ID（可選）"), "5");
    
    // 送出表單
    await user.click(screen.getByRole("button", { name: "建立案件" }));
    
    // 驗證API被呼叫且正確轉換為數字
    expect(fetchMock).toHaveBeenCalled();
    expect(submittedData?.supplier_id).toBe(5);
  });

  it("allows defect_qty to be empty, 0, and 0.1234", async () => {
    const user = userEvent.setup();
    let submittedData: Record<string, unknown> | null = null;
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/v1/nonconformances") && init?.method === "POST") {
        submittedData = JSON.parse(init.body as string);
        return response(record, 201);
      }
      if (String(input).endsWith("/api/v1/nonconformances/1")) return response(record);
      return response({ items: [record], total: 1, page: 1, page_size: 20 });
    });

    // 測試0.1234可以通過
    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "新增案件" }));
    
    await user.type(screen.getByLabelText("異常編號"), "NC-NEW");
    await user.type(screen.getByLabelText("標題"), "Surface crack");
    await user.type(screen.getByLabelText("異常描述"), "Found in incoming inspection");
    await user.type(screen.getByLabelText("不良數量"), "0.1234");
    
    await user.click(screen.getByRole("button", { name: "建立案件" }));
    
    expect(fetchMock).toHaveBeenCalled();
    expect(submittedData?.defect_qty).toBe(0.1234);
  });

  it("shows validation errors for invalid defect_qty values and prevents API call", async () => {
    const user = userEvent.setup();
    let postCalled = false;
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/v1/nonconformances") && init?.method === "POST") {
        postCalled = true;
      }
      if (String(input).endsWith("/api/v1/nonconformances/1")) return response(record);
      return response({ items: [record], total: 1, page: 1, page_size: 20 });
    });

    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "新增案件" }));
    
    await user.type(screen.getByLabelText("異常編號"), "NC-NEW");
    await user.type(screen.getByLabelText("標題"), "Surface crack");
    await user.type(screen.getByLabelText("異常描述"), "Found in incoming inspection");
    // 輸入超過4位小數的值
    await user.type(screen.getByLabelText("不良數量"), "0.12345");
    
    await user.click(screen.getByRole("button", { name: "建立案件" }));
    
    // 驗證驗證錯誤出現
    expect(await screen.findByText("必須是非負數，最多支援4位小數")).toBeTruthy();
    // 驗證API沒有被呼叫
    expect(postCalled).toBe(false);
  });

  it("tests various invalid ID values (negative, decimal, non-numeric)", async () => {
    const user = userEvent.setup();
    
    // 測試負數ID
    render(<MemoryRouter><NonconformancePage profile={profile} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "新增案件" }));
    
    await user.type(screen.getByLabelText("異常編號"), "NC-NEW");
    await user.type(screen.getByLabelText("標題"), "Surface crack");
    await user.type(screen.getByLabelText("異常描述"), "Found in incoming inspection");
    await user.type(screen.getByLabelText("供應商 ID（可選）"), "-1");
    
    await user.click(screen.getByRole("button", { name: "建立案件" }));
    expect(await screen.findByText("必須是有效的正整數")).toBeTruthy();
  });
});