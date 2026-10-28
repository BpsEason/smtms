import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CatalogPages } from "../../src/pages/CatalogPages";
import type { UserProfile } from "../../src/types";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        cacheTime: 0,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

function setFieldValue(label: string, value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: label, exact: false }), { target: { value } });
}

const fetchMock = vi.fn();

const writerProfile: UserProfile = {
  id: 7,
  username: "qa",
  email: "qa@example.test",
  is_active: true,
  roles: ["admin"],
  permissions: ["suppliers:read", "suppliers:write"],
};
const materialWriterProfile: UserProfile = {
  ...writerProfile,
  permissions: [...writerProfile.permissions, "materials:read", "materials:write"],
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
  renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
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
    renderWithProviders(
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

describe("material form validation", () => {
  it("shows validation errors when required fields are empty", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="materials" profile={materialWriterProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增物料" }));
    await userEvent.click(screen.getByRole("button", { name: "建立物料" }));

    expect(await screen.findByText("物料代碼為必填")).toBeInTheDocument();
    expect(screen.getByText("物料名稱為必填")).toBeInTheDocument();
    expect(screen.getByText("物料類別為必填")).toBeInTheDocument();
    expect(screen.getByText("計量單位為必填")).toBeInTheDocument();
  });

  it("shows validation errors when field lengths exceed limits", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="materials" profile={materialWriterProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增物料" }));
    
    setFieldValue("物料代碼", "a".repeat(81));
    setFieldValue("物料名稱", "a".repeat(201));
    setFieldValue("物料類別", "a".repeat(51));
    setFieldValue("計量單位", "a".repeat(31));
    setFieldValue("規格", "a".repeat(256));
    
    await userEvent.click(screen.getByRole("button", { name: "建立物料" }));

    expect(await screen.findByText("物料代碼最多80字元")).toBeInTheDocument();
    expect(screen.getByText("物料名稱最多200字元")).toBeInTheDocument();
    expect(screen.getByText("物料類別最多50字元")).toBeInTheDocument();
    expect(screen.getByText("計量單位最多30字元")).toBeInTheDocument();
    expect(screen.getByText("規格最多255字元")).toBeInTheDocument();
  });

  it("loads correct default values in create mode", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="materials" profile={materialWriterProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增物料" }));
    
    // 等待Modal內的表單元素渲染完成
    const statusSelect = await screen.findByLabelText("物料狀態");
    expect(statusSelect).toHaveValue("active");
    expect(await screen.findByLabelText("物料代碼")).toHaveValue("");
    expect(await screen.findByLabelText("物料名稱")).toHaveValue("");
  });

  it("loads correct data in edit mode", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="materials" profile={materialWriterProfile} />);
    
    await screen.findByText("Alloy Sheet");
    await userEvent.click(screen.getByRole("button", { name: "編輯資料" }));
    
    // 等待Modal內的表單元素渲染完成
    expect(await screen.findByLabelText("物料代碼")).toHaveValue("MAT-08");
    expect(await screen.findByLabelText("物料名稱")).toHaveValue("Alloy Sheet");
    expect(await screen.findByLabelText("物料類別")).toHaveValue("raw");
    expect(await screen.findByLabelText("計量單位")).toHaveValue("kg");
    expect(await screen.findByLabelText("物料狀態")).toHaveValue("active");
  });

  it("does not retain previous data when switching between different edit entries", async () => {
    const secondMaterial = { ...material, id: 9, material_code: "MAT-09", material_name: "Another Material", material_type: "finished", uom: "pcs" };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/materials"))
        return jsonResponse(page([material, secondMaterial]));
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="materials" profile={materialWriterProfile} />);
    
    await screen.findByText("Alloy Sheet");
    
    // Edit first material
    const editButtons = await screen.findAllByRole("button", { name: "編輯資料" });
    await userEvent.click(editButtons[0]);
    expect(screen.getByLabelText("物料代碼")).toHaveValue("MAT-08");
    
    // Close and edit second material
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    await userEvent.click(editButtons[1]);
    expect(screen.getByLabelText("物料代碼")).toHaveValue("MAT-09");
  });

  it("preserves user input and shows error when API submission fails", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/materials") && init?.method === "POST") {
        callCount++;
        return jsonResponse({ detail: "物料代碼已存在" }, 400);
      }
      if (url.includes("/api/v1/materials"))
        return jsonResponse(page([material]));
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="materials" profile={materialWriterProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增物料" }));
    
    await userEvent.type(screen.getByLabelText("物料代碼"), "MAT-08");
    await userEvent.type(screen.getByLabelText("物料名稱"), "Duplicate Material");
    await userEvent.type(screen.getByLabelText("物料類別"), "raw");
    await userEvent.type(screen.getByLabelText("計量單位"), "kg");
    
    await userEvent.click(screen.getByRole("button", { name: "建立物料" }));
    
    expect(await screen.findByRole("alert")).toHaveTextContent("操作失敗：物料代碼已存在");
    expect(screen.getByLabelText("物料代碼")).toHaveValue("MAT-08");
    expect(screen.getByLabelText("物料名稱")).toHaveValue("Duplicate Material");
    expect(callCount).toBe(1); // Only one submission, no duplicate requests
  });

  it("invalidates query cache after successful creation", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/materials") && init?.method === "POST")
        return jsonResponse({ id: 9, material_code: "MAT-09", material_name: "New Material", material_type: "raw", uom: "kg", status: "active" }, 201);
      if (url.includes("/api/v1/materials"))
        return jsonResponse(page([material]));
      return jsonResponse(page([]));
    });
    
    render(
      <QueryClientProvider client={queryClient}>
        <CatalogPages kind="materials" profile={materialWriterProfile} />
      </QueryClientProvider>
    );
    
    await userEvent.click(screen.getByRole("button", { name: "新增物料" }));
    
    await userEvent.type(screen.getByLabelText("物料代碼"), "MAT-09");
    await userEvent.type(screen.getByLabelText("物料名稱"), "New Material");
    await userEvent.type(screen.getByLabelText("物料類別"), "raw");
    await userEvent.type(screen.getByLabelText("計量單位"), "kg");
    
    await userEvent.click(screen.getByRole("button", { name: "建立物料" }));
    
    expect(await screen.findByText("物料已建立。")).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['materials'] });
  });
});

describe("supplier form validation", () => {
  it("shows validation errors when required fields are empty", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增供應商" }));
    await userEvent.click(screen.getByRole("button", { name: "建立供應商" }));

    expect(await screen.findByText("供應商代碼為必填")).toBeInTheDocument();
    expect(screen.getByText("供應商名稱為必填")).toBeInTheDocument();
  });

  it("validates email format correctly", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增供應商" }));
    
    await userEvent.type(screen.getByLabelText("電子郵件"), "invalid-email");
    await userEvent.click(screen.getByRole("button", { name: "建立供應商" }));
    
    expect(await screen.findByText("電子郵件格式不正確")).toBeInTheDocument();
  });

  it("loads correct default values in create mode", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增供應商" }));
    
    const statusSelect = screen.getAllByRole("combobox").find((element) => element.closest("form"))!;
    expect(statusSelect).toHaveValue("active");
    expect(screen.getByLabelText("供應商代碼")).toHaveValue("");
    expect(screen.getByLabelText("供應商名稱")).toHaveValue("");
  });

  it("loads correct data in edit mode", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    await userEvent.click(screen.getByRole("button", { name: "編輯資料" }));
    
    expect(screen.getByLabelText("供應商代碼")).toHaveValue("SUP-04");
    expect(screen.getByLabelText("供應商名稱")).toHaveValue("Precision Supply");
    expect(screen.getAllByRole("combobox").find((element) => element.closest("form"))!).toHaveValue("active");
  });

  it("clears form correctly when switching from edit to create mode", async () => {
    const secondSupplier = { ...supplier, id: 5, supplier_code: "SUP-05", supplier_name: "Another Supplier" };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers"))
        return jsonResponse(page([supplier, secondSupplier]));
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    
    // Edit first supplier
    const editButtons = await screen.findAllByRole("button", { name: "編輯資料" });
    await userEvent.click(editButtons[0]);
    expect(screen.getByLabelText("供應商代碼")).toHaveValue("SUP-04");
    
    // Close and open create form
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    await userEvent.click(screen.getByRole("button", { name: "新增供應商" }));
    
    expect(screen.getByLabelText("供應商代碼")).toHaveValue("");
    expect(screen.getByLabelText("供應商名稱")).toHaveValue("");
  });

  it("shows validation errors when field lengths exceed limits", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增供應商" }));
    
    setFieldValue("供應商代碼", "a".repeat(81));
    setFieldValue("供應商名稱", "a".repeat(201));
    setFieldValue("聯絡人", "a".repeat(121));
    setFieldValue("電子郵件", `${"a".repeat(160)}@example.com`);
    setFieldValue("電話", "a".repeat(41));
    setFieldValue("國家／地區", "a".repeat(81));
    setFieldValue("地址", "a".repeat(256));
    fireEvent.change(screen.getByLabelText("統一編號", { exact: false }), { target: { value: "a".repeat(21) } });
    
    await userEvent.click(screen.getByRole("button", { name: "建立供應商" }));

    expect(await screen.findByText("供應商代碼最多80字元")).toBeInTheDocument();
    expect(screen.getByText("供應商名稱最多200字元")).toBeInTheDocument();
    expect(screen.getByText("聯絡人最多120字元")).toBeInTheDocument();
    expect(screen.getByText("電子郵件最多160字元")).toBeInTheDocument();
    expect(screen.getByText("電話最多40字元")).toBeInTheDocument();
    expect(screen.getByText("國家/地區最多80字元")).toBeInTheDocument();
    expect(screen.getByText("地址最多255字元")).toBeInTheDocument();
    expect(screen.getByText("統一編號最多20字元")).toBeInTheDocument();
  });

  it("preserves user input and shows error when API submission fails", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers") && init?.method === "POST") {
        callCount++;
        return jsonResponse({ detail: "供應商代碼已存在" }, 400);
      }
      if (url.includes("/api/v1/suppliers"))
        return jsonResponse(page([supplier]));
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await userEvent.click(screen.getByRole("button", { name: "新增供應商" }));
    
    await userEvent.type(screen.getByLabelText("供應商代碼"), "SUP-04");
    await userEvent.type(screen.getByLabelText("供應商名稱"), "Duplicate Supplier");
    
    await userEvent.click(screen.getByRole("button", { name: "建立供應商" }));
    
    expect(await screen.findByRole("alert")).toHaveTextContent("操作失敗：供應商代碼已存在");
    expect(screen.getByLabelText("供應商代碼")).toHaveValue("SUP-04");
    expect(screen.getByLabelText("供應商名稱")).toHaveValue("Duplicate Supplier");
    expect(callCount).toBe(1); // 防止重複提交
  });

  it("invalidates query cache after successful creation", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers") && init?.method === "POST")
        return jsonResponse({ id: 5, supplier_code: "SUP-05", supplier_name: "New Supplier", status: "active" }, 201);
      if (url.includes("/api/v1/suppliers"))
        return jsonResponse(page([supplier]));
      return jsonResponse(page([]));
    });
    
    render(
      <QueryClientProvider client={queryClient}>
        <CatalogPages kind="suppliers" profile={writerProfile} />
      </QueryClientProvider>
    );
    
    await userEvent.click(screen.getByRole("button", { name: "新增供應商" }));
    
    await userEvent.type(screen.getByLabelText("供應商代碼"), "SUP-05");
    await userEvent.type(screen.getByLabelText("供應商名稱"), "New Supplier");
    
    await userEvent.click(screen.getByRole("button", { name: "建立供應商" }));
    
    expect(await screen.findByText("供應商已建立。")).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['suppliers'] });
  });

  it("does not retain previous data when switching between different edit entries", async () => {
    const secondSupplier = { ...supplier, id: 5, supplier_code: "SUP-05", supplier_name: "Another Supplier", country: "CN" };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers"))
        return jsonResponse(page([supplier, secondSupplier]));
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    
    // Edit first supplier
    const editButtons = await screen.findAllByRole("button", { name: "編輯資料" });
    await userEvent.click(editButtons[0]);
    expect(screen.getByLabelText("供應商代碼")).toHaveValue("SUP-04");
    
    // Close and edit second supplier
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    await userEvent.click(editButtons[1]);
    expect(screen.getByLabelText("供應商代碼")).toHaveValue("SUP-05");
  });
});

describe("supplier documents panel", () => {
  it("shows validation errors for required document fields", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers?"))
        return jsonResponse(page([supplier]));
      if (url.includes("/api/v1/suppliers/4/documents"))
        return jsonResponse([]);
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    await userEvent.click(screen.getByRole("button", { name: "資格文件" }));
    
    await userEvent.click(await screen.findByRole("button", { name: "新增文件" }));
    
    expect(await screen.findByText("文件類型為必填")).toBeInTheDocument();
    expect(screen.getByText("文件名稱為必填")).toBeInTheDocument();
  });

  it("loads correct data in edit mode for documents", async () => {
    const testDoc = {
      id: 1,
      doc_type: "合約書",
      doc_name: "供應合約2024",
      doc_code: "DOC-001",
      status: "active",
      issued_at: "2024-01-01T00:00:00.000Z",
      expires_at: "2025-01-01T00:00:00.000Z",
    };
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers?"))
        return jsonResponse(page([supplier]));
      if (url.includes("/api/v1/suppliers/4/documents"))
        return jsonResponse([testDoc]);
      if (url.includes("/api/v1/suppliers/4/documents/1/attachments"))
        return jsonResponse([]);
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    // 直接從列表中點擊資格文件按鈕
    await userEvent.click(await screen.findByRole("button", { name: "資格文件" }));
    
    await screen.findByText("供應合約2024");
    await userEvent.click(screen.getByRole("button", { name: "編輯" }));
    
    expect(screen.getByLabelText("文件類型")).toHaveValue("合約書");
    expect(screen.getByLabelText("文件名稱")).toHaveValue("供應合約2024");
    expect(screen.getByLabelText("文件編號")).toHaveValue("DOC-001");
    expect(screen.getByLabelText("發證日")).toHaveValue("2024-01-01");
    expect(screen.getByLabelText("到期日")).toHaveValue("2025-01-01");
  });

  it("handles document creation successfully", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers?"))
        return jsonResponse(page([supplier]));
      if (url.includes("/api/v1/suppliers/4/documents") && init?.method === "POST")
        return jsonResponse({ id: 1, doc_type: "合約書", doc_name: "新合約", status: "active" }, 201);
      if (url.includes("/api/v1/suppliers/4/documents"))
        return jsonResponse([]);
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    await userEvent.click(screen.getByRole("button", { name: "資格文件" }));
    
    await userEvent.type(screen.getByLabelText("文件類型"), "合約書");
    await userEvent.type(screen.getByLabelText("文件名稱"), "新合約");
    await userEvent.click(screen.getByRole("button", { name: "新增文件" }));
    
    expect(await screen.findByText("資格文件已建立。")).toBeInTheDocument();
  });

  it("shows validation errors when field lengths exceed limits", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers?"))
        return jsonResponse(page([supplier]));
      if (url.includes("/api/v1/suppliers/4/documents"))
        return jsonResponse([]);
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    await userEvent.click(screen.getByRole("button", { name: "資格文件" }));
    
    setFieldValue("文件類型", "a".repeat(51));
    setFieldValue("文件名稱", "a".repeat(201));
    setFieldValue("文件編號", "a".repeat(81));
    
    await userEvent.click(screen.getByRole("button", { name: "新增文件" }));

    expect(await screen.findByText("文件類型最多50字元")).toBeInTheDocument();
    expect(screen.getByText("文件名稱最多200字元")).toBeInTheDocument();
    expect(screen.getByText("文件編號最多80字元")).toBeInTheDocument();
  });

  it("loads correct default values in create mode", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers?"))
        return jsonResponse(page([supplier]));
      if (url.includes("/api/v1/suppliers/4/documents"))
        return jsonResponse([]);
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    await userEvent.click(screen.getByRole("button", { name: "資格文件" }));
    
    const statusSelect = screen.getAllByRole("combobox").find((element) => element.closest("form"))!;
    expect(statusSelect).toHaveValue("active");
    expect(screen.getByLabelText("文件類型")).toHaveValue("");
    expect(screen.getByLabelText("文件名稱")).toHaveValue("");
    expect(screen.getByLabelText("發證日")).toHaveValue("");
    expect(screen.getByLabelText("到期日")).toHaveValue("");
  });

  it("does not retain previous data when switching between different edit entries", async () => {
    const firstDoc = {
      id: 1,
      doc_type: "合約書",
      doc_name: "供應合約2024",
      doc_code: "DOC-001",
      status: "active",
      issued_at: "2024-01-01T00:00:00.000Z",
      expires_at: "2025-01-01T00:00:00.000Z",
    };
    const secondDoc = {
      id: 2,
      doc_type: "保單",
      doc_name: "保險合約2024",
      doc_code: "DOC-002",
      status: "active",
      issued_at: "2024-02-01T00:00:00.000Z",
      expires_at: "2025-02-01T00:00:00.000Z",
    };
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers?"))
        return jsonResponse(page([supplier]));
      if (url.includes("/api/v1/suppliers/4/documents"))
        return jsonResponse([firstDoc, secondDoc]);
      if (url.includes("/api/v1/suppliers/4/documents/1/attachments"))
        return jsonResponse([]);
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    await userEvent.click(screen.getByRole("button", { name: "資格文件" }));
    
    await screen.findByText("供應合約2024");
    // Edit first document
    const editButtons = await screen.findAllByRole("button", { name: "編輯" });
    await userEvent.click(editButtons[0]);
    expect(screen.getByLabelText("文件類型")).toHaveValue("合約書");
    
    // Close and edit second document
    await userEvent.click(screen.getByRole("button", { name: "取消編輯" }));
    await userEvent.click(editButtons[1]);
    expect(screen.getByLabelText("文件類型")).toHaveValue("保單");
  });

  it("preserves user input and shows error when API submission fails", async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers/4/documents") && init?.method === "POST") {
        callCount++;
        return jsonResponse({ detail: "文件編號已存在" }, 400);
      }
      if (url.includes("/api/v1/suppliers?"))
        return jsonResponse(page([supplier]));
      if (url.includes("/api/v1/suppliers/4/documents"))
        return jsonResponse([]);
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    await userEvent.click(screen.getByRole("button", { name: "資格文件" }));
    
    await userEvent.type(screen.getByLabelText("文件類型"), "合約書");
    await userEvent.type(screen.getByLabelText("文件名稱"), "重複文件");
    await userEvent.type(screen.getByLabelText("文件編號"), "DOC-001");
    
    await userEvent.click(screen.getByRole("button", { name: "新增文件" }));
    
    expect(await screen.findByRole("alert")).toHaveTextContent("操作失敗：文件編號已存在");
    expect(screen.getByLabelText("文件類型")).toHaveValue("合約書");
    expect(screen.getByLabelText("文件名稱")).toHaveValue("重複文件");
    expect(screen.getByLabelText("文件編號")).toHaveValue("DOC-001");
    expect(callCount).toBe(1); // 防止重複提交
  });

  it("loads date fields correctly in edit mode", async () => {
    const testDoc = {
      id: 1,
      doc_type: "合約書",
      doc_name: "供應合約2024",
      doc_code: "DOC-001",
      status: "active",
      issued_at: "2024-06-15T00:00:00.000Z",
      expires_at: "2025-06-15T00:00:00.000Z",
    };
    
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/suppliers?"))
        return jsonResponse(page([supplier]));
      if (url.includes("/api/v1/suppliers/4/documents"))
        return jsonResponse([testDoc]);
      return jsonResponse(page([]));
    });
    
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    
    await screen.findByText("Precision Supply");
    await userEvent.click(screen.getByRole("button", { name: "資格文件" }));
    
    await screen.findByText("供應合約2024");
    await userEvent.click(screen.getByRole("button", { name: "編輯" }));
    
    expect(screen.getByLabelText("發證日")).toHaveValue("2024-06-15");
    expect(screen.getByLabelText("到期日")).toHaveValue("2025-06-15");
  });
});

describe("supplier-material setup", () => {
  it("creates the material association needed before batch registration", async () => {
    installMock({});
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
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
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
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
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
    await waitForSupplierRequest(1);

    fireEvent.change(screen.getByRole("textbox", { name: "搜尋供應商" }), {
      target: { value: "latest" },
    });
    await waitForSupplierRequest(2);

    await act(async () => {
      newRequest.resolve(jsonResponse({ detail: "最新查詢失敗" }, 500));
      await newRequest.promise;
    });
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("操作失敗：最新查詢失敗");

    await act(async () => {
      oldRequest.resolve(jsonResponse({ detail: "舊查詢失敗" }, 500));
      await oldRequest.promise;
    });
    expect(screen.getByRole("alert")).toHaveTextContent("操作失敗：最新查詢失敗");
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
    renderWithProviders(<CatalogPages kind="suppliers" profile={writerProfile} />);
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
    const { unmount } = renderWithProviders(
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