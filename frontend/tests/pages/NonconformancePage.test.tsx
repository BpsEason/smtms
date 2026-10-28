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
    expect(screen.getByText("Lot review")).toBeTruthy();
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