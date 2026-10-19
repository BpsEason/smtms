import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogPages } from "./CatalogPages";
import type { UserProfile } from "../types";

const fetchMock = vi.fn();

const writerProfile: UserProfile = {
  id: 7,
  username: "qa",
  email: "qa@example.test",
  is_active: true,
  roles: ["admin"],
  permissions: ["suppliers:read", "suppliers:write"],
};

const supplier = {
  id: 4,
  supplier_code: "SUP-04",
  supplier_name: "Precision Supply",
  tax_id: null,
  contact_name: null,
  phone: null,
  email: null,
  status: "active",
  address: null,
  country: "TW",
  created_at: "",
  updated_at: "",
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.URL.createObjectURL = vi.fn(() => "blob:mock");
  window.URL.revokeObjectURL = vi.fn();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function blobResponse(blob: Blob, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: () => Promise.resolve(blob),
  } as Response;
}

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, page_size: 20 };
}

function installMock(handlers: { preview?: Response; confirm?: Response }) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/suppliers/import/template"))
      return blobResponse(new Blob(["xlsx"]));
    if (url.endsWith("/api/v1/suppliers/import/preview"))
      return handlers.preview ?? jsonResponse({ detail: "unexpected" }, 500);
    if (url.endsWith("/api/v1/suppliers/import/confirm"))
      return handlers.confirm ?? jsonResponse({ detail: "unexpected" }, 500);
    if (url.includes("/api/v1/suppliers"))
      return jsonResponse(page([supplier]));
    return jsonResponse(page([]));
  });
}

async function openImportPanel() {
  render(<CatalogPages kind="suppliers" profile={writerProfile} />);
  await userEvent.click(screen.getByRole("button", { name: "批次匯入" }));
}

async function attachWorkbook() {
  const file = new File(["data"], "suppliers.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await userEvent.upload(screen.getByLabelText("選擇供應商匯入檔案"), file);
}

describe("supplier import panel", () => {
  it("hides the import entry from users without write permission", () => {
    installMock({});
    render(
      <CatalogPages
        kind="suppliers"
        profile={{ ...writerProfile, permissions: ["suppliers:read"] }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "批次匯入" }),
    ).not.toBeInTheDocument();
  });

  it("requires a file before previewing and shows validation errors in a table", async () => {
    installMock({
      preview: jsonResponse({
        sheet: "suppliers",
        total_rows: 2,
        valid_rows: 1,
        error_rows: 1,
        skipped_rows: 0,
        rows: [],
        errors: [
          {
            sheet: "suppliers",
            row: 3,
            field: "tax_id",
            message: "統一編號重複：11111111",
          },
        ],
      }),
    });
    await openImportPanel();

    expect(screen.getByRole("button", { name: "預覽驗證" })).toBeDisabled();
    await attachWorkbook();
    await userEvent.click(screen.getByRole("button", { name: "預覽驗證" }));

    expect(
      await screen.findByText("統一編號重複：11111111"),
    ).toBeInTheDocument();
    expect(screen.getByText("錯誤")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認匯入" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /下載錯誤報告/ }),
    ).toBeInTheDocument();
  });

  it("previews a valid file and confirms the import, showing created accounts", async () => {
    installMock({
      preview: jsonResponse({
        sheet: "suppliers",
        total_rows: 1,
        valid_rows: 1,
        error_rows: 0,
        skipped_rows: 0,
        rows: [],
        errors: [],
      }),
      confirm: jsonResponse({
        status: "completed",
        created: 1,
        failed: 0,
        skipped: 0,
        errors: [],
        accounts: [
          {
            sheet: "suppliers",
            row: 2,
            supplier_id: 50,
            supplier_code: "SUP-50",
            login_username: "sup50",
            initial_password: "Init1Pass!",
            password_generated: false,
          },
        ],
      }),
    });
    await openImportPanel();
    await attachWorkbook();
    await userEvent.click(screen.getByRole("button", { name: "預覽驗證" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "確認匯入" }),
    );

    expect(
      await screen.findByText(/匯入完成：新增 1 筆供應商與登入帳號/),
    ).toBeInTheDocument();
    expect(screen.getByText("sup50")).toBeInTheDocument();
    expect(screen.getByText("Init1Pass!")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/api/v1/suppliers/import/confirm"),
      ),
    ).toBe(true);
  });

  it("surfaces API failures without claiming success", async () => {
    installMock({ preview: jsonResponse({ detail: "檔案格式錯誤。" }, 422) });
    await openImportPanel();
    await attachWorkbook();
    await userEvent.click(screen.getByRole("button", { name: "預覽驗證" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失敗：檔案格式錯誤。",
    );
  });

  it("downloads the Excel template from the panel", async () => {
    installMock({});
    await openImportPanel();
    await userEvent.click(
      screen.getByRole("button", { name: /下載 Excel 範本/ }),
    );
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/api/v1/suppliers/import/template"),
      ),
    ).toBe(true);
  });
});
