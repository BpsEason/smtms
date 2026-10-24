import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { saveToken } from "../../src/api/client";
import { AuditLogPage } from "../../src/pages/AuditLogPage";
import type { AuditLog } from "../../src/types";

const fetchMock = vi.fn();
const entry: AuditLog = {
  id: 101,
  actor_user_id: 7,
  actor_username: "qa.operator",
  action: "UPDATE",
  resource_type: "materials",
  resource_id: "42",
  before_data: { status: "active" },
  after_data: { status: "inactive" },
  request_id: "req-abc",
  created_at: "2026-10-21T02:00:00Z",
};

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(["csv-content"], { type: "text/csv" })),
  } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  saveToken("audit-test-token");
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:audit") });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/export.csv")) return jsonResponse({});
    return jsonResponse({ items: [entry], page: 1, page_size: 20 });
  });
});

describe("AuditLogPage", () => {
  it("filters by operator and resource type and shows before and after details", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AuditLogPage /></MemoryRouter>);

    expect(await screen.findByText("qa.operator")).toBeInTheDocument();
    expect(screen.getByText("materials")).toBeInTheDocument();
    await user.type(screen.getByLabelText("操作者帳號"), "qa.operator");
    await user.type(screen.getByLabelText("資源類型"), "materials");
    await user.selectOptions(screen.getByLabelText("操作類型"), "UPDATE");
    await user.click(screen.getByRole("button", { name: "套用篩選" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("actor_username=qa.operator"),
      expect.anything(),
    ));
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("action=UPDATE"),
      expect.anything(),
    );
    await user.click(screen.getByRole("button", { name: "查看紀錄 101" }));
    expect(screen.getByRole("region", { name: "稽核紀錄明細" })).toHaveTextContent('"active"');
    expect(screen.getByRole("region", { name: "稽核紀錄明細" })).toHaveTextContent('"inactive"');
    expect(screen.getByRole("region", { name: "稽核紀錄明細" })).toHaveTextContent("Request ID：req-abc");
  });

  it("exports the active filters without pagination", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AuditLogPage /></MemoryRouter>);
    await screen.findByText("qa.operator");
    await user.type(screen.getByLabelText("資源類型"), "materials");
    await user.click(screen.getByRole("button", { name: "套用篩選" }));
    await user.click(await screen.findByRole("button", { name: "匯出篩選結果 CSV" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/audit-logs/export.csv?resource_type=materials"),
      expect.objectContaining({ headers: expect.any(Headers) }),
    ));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("moves through pages of audit records", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const pageNumber = Number(new URLSearchParams(url.split("?")[1]).get("page") ?? "1");
      const records = pageNumber === 1
        ? Array.from({ length: 20 }, (_, index) => ({ ...entry, id: index + 1 }))
        : [{ ...entry, id: 21 }];
      return jsonResponse({ items: records, page: pageNumber, page_size: 20 });
    });
    render(<MemoryRouter><AuditLogPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "查看紀錄 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一頁" }));
    expect(await screen.findByRole("button", { name: "查看紀錄 21" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("page=2"),
      expect.anything(),
    );
  });
});
