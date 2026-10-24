import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogPages } from "../../src/pages/CatalogPages";
import type { UserProfile } from "../../src/types";

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
const material = {
  id: 8,
  material_code: "MAT-08",
  material_name: "Alloy Sheet",
  material_type: "raw",
  spec: null,
  uom: "kg",
  status: "active",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function supplierNamed(id: number, name: string) {
  return { ...supplier, id, supplier_code: `SUP-${id}`, supplier_name: name };
}

async function waitForSupplierRequest(count: number) {
  await waitFor(() => {
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/v1/suppliers?"),
      ),
    ).toHaveLength(count);
  });
}

function installMock(handlers: { preview?: Response; confirm?: Response }) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/v1/suppliers/4/materials") && init?.method === "POST")
      return jsonResponse({ id: 12, supplier_id: 4, material_id: 8, supplier_material_code: "SUP-MAT-08", is_preferred: false, created_at: "" }, 201);
    if (url.endsWith("/api/v1/suppliers/import/template"))
      return blobResponse(new Blob(["xlsx"]));
    if (url.endsWith("/api/v1/suppliers/import/preview"))
      return handlers.preview ?? jsonResponse({ detail: "unexpected" }, 500);
    if (url.endsWith("/api/v1/suppliers/import/confirm"))
      return handlers.confirm ?? jsonResponse({ detail: "unexpected" }, 500);
    if (url.includes("/api/v1/suppliers"))
      return jsonResponse(page([supplier]));
    if (url.includes("/api/v1/materials"))
      return jsonResponse(page([material]));
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

describe("supplier-material setup", () => {
  it("creates the material association needed before batch registration", async () => {
    installMock({});
    render(<CatalogPages kind="suppliers" profile={writerProfile} />);
    await userEvent.click(await screen.findByRole("button", { name: "連結物料" }));
    await userEvent.selectOptions(await screen.findByLabelText("物料"), "8");
    await userEvent.type(screen.getByLabelText("供應商料號"), "SUP-MAT-08");
    await userEvent.click(screen.getByRole("button", { name: "建立關聯" }));

    expect(await screen.findByText(/已建立「Precision Supply」與所選物料的供應關聯/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/suppliers/4/materials"),
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"material_id":8') }),
    );
  });
});

describe("supplier list request races", () => {
  it("keeps the newest result when an earlier request finishes later", async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes("keyword=latest")
        ? newRequest.promise
        : oldRequest.promise,
    );
    render(<CatalogPages kind="suppliers" profile={writerProfile} />);
    await waitForSupplierRequest(1);

    fireEvent.change(screen.getByRole("textbox", { name: "搜尋供應商" }), {
      target: { value: "latest" },
    });
    await waitForSupplierRequest(2);

    await act(async () => {
      newRequest.resolve(jsonResponse(page([supplierNamed(2, "Latest Supplier")])));
      await newRequest.promise;
    });
    expect(await screen.findByText("Latest Supplier")).toBeInTheDocument();

    await act(async () => {
      oldRequest.resolve(jsonResponse(page([supplierNamed(1, "Old Supplier")])));
      await oldRequest.promise;
    });
    expect(screen.getByText("Latest Supplier")).toBeInTheDocument();
    expect(screen.queryByText("Old Supplier")).not.toBeInTheDocument();
  });

  it("does not let an earlier failure replace the newest error", async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes("keyword=latest")
        ? newRequest.promise
        : oldRequest.promise,
    );
    render(<CatalogPages kind="suppliers" profile={writerProfile} />);
    await waitForSupplierRequest(1);

    fireEvent.change(screen.getByRole("textbox", { name: "搜尋供應商" }), {
      target: { value: "latest" },
    });
    await waitForSupplierRequest(2);

    await act(async () => {
      newRequest.resolve(jsonResponse({ detail: "最新查詢失敗" }, 500));
      await newRequest.promise;
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("最新查詢失敗");

    await act(async () => {
      oldRequest.resolve(jsonResponse({ detail: "舊查詢失敗" }, 500));
      await oldRequest.promise;
    });
    expect(screen.getByRole("alert")).toHaveTextContent("最新查詢失敗");
    expect(screen.getByRole("alert")).not.toHaveTextContent("舊查詢失敗");
  });

  it("keeps loading while the latest request is pending after an older one finishes", async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes("keyword=latest")
        ? newRequest.promise
        : oldRequest.promise,
    );
    render(<CatalogPages kind="suppliers" profile={writerProfile} />);
    await waitForSupplierRequest(1);

    fireEvent.change(screen.getByRole("textbox", { name: "搜尋供應商" }), {
      target: { value: "latest" },
    });
    await waitForSupplierRequest(2);

    await act(async () => {
      oldRequest.resolve(jsonResponse(page([supplierNamed(1, "Old Supplier")])));
      await oldRequest.promise;
    });
    expect(screen.getByRole("status")).toHaveTextContent("正在載入供應商資料");

    await act(async () => {
      newRequest.resolve(jsonResponse(page([supplierNamed(2, "Latest Supplier")])));
      await newRequest.promise;
    });
    expect(await screen.findByText("Latest Supplier")).toBeInTheDocument();
    expect(screen.queryByText("正在載入供應商資料")).not.toBeInTheDocument();
  });

  it("ignores a pending list response after unmount", async () => {
    const pendingRequest = deferred<Response>();
    fetchMock.mockImplementation(() => pendingRequest.promise);
    const { unmount } = render(
      <CatalogPages kind="suppliers" profile={writerProfile} />,
    );
    await waitForSupplierRequest(1);
    unmount();

    await act(async () => {
      pendingRequest.resolve(jsonResponse(page([supplierNamed(1, "Late Supplier")])));
      await pendingRequest.promise;
    });
    expect(screen.queryByText("Late Supplier")).not.toBeInTheDocument();
  });
});
