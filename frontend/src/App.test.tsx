import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { buildTraceabilityPageCsv } from "./lib/traceabilityCsv";

const fetchMock = vi.fn();
const receipt = {
  id: 21,
  supplier_id: 4,
  material_id: 8,
  supplier_lot_id: 13,
  receipt_no: "RCV-TEST-21",
  received_at: "2026-10-19T12:00:00Z",
  received_by_user_id: 7,
  qty_received: "12.0000",
  qty_remaining: "12.0000",
  status: "received",
  notes: null,
  created_at: "2026-10-19T12:00:00Z",
};
const internalLot = {
  id: 31,
  material_id: 8,
  supplier_lot_id: 13,
  receipt_id: 21,
  internal_lot_no: "LOT-TEST-31",
  qty_on_hand: "12.0000",
  qty_reserved: "0.0000",
  uom: "kg",
  lot_status: "quarantine",
  expiry_date: null,
  created_at: "2026-10-19T12:00:00Z",
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
const supplierLot = {
  id: 13,
  supplier_id: 4,
  material_id: 8,
  supplier_lot_no: "SUPLOT-13",
  manufacturing_date: null,
  expiry_date: null,
  qty_received: "100.0000",
  uom: "kg",
  qc_status: "approved",
  created_at: "",
};

beforeEach(() => {
  fetchMock.mockReset();
  window.localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
});

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}
function page<T>(items: T[], total = items.length) {
  return { items, total, page: 1, page_size: 100 };
}
function installApiMock(withWorkflowData = false, withQualityPermissions = false, withNonconformancePermissions = false) {
  let savedReceipt: typeof receipt | null = null;
  let savedLot: typeof internalLot | null = null;
  let savedIqc: Record<string, unknown> | null = null;
  fetchMock.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const jsonBody = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      if (url.endsWith("/api/v1/auth/login"))
        return response({ access_token: "demo-token", token_type: "bearer" });
      if (url.endsWith("/api/v1/auth/me"))
        return response({
          id: 7,
          username: "qa",
          email: "qa@example.test",
          is_active: true,
          roles: ["quality"],
          permissions: withWorkflowData
            ? [
                "suppliers:read",
                "suppliers:write",
                "materials:read",
                "materials:write",
                "receipts:read",
                "receipts:write",
                "iqc:read",
                "iqc:write",
              ]
            : [
                "iqc:read",
                "iqc:write",
                ...(withQualityPermissions
                  ? ["quality:review", "quality:approve", "quality:return"]
                  : []),
                ...(withNonconformancePermissions
                  ? ["nonconformance:read", "nonconformance:write"]
                  : []),
              ],
        });
      if (url.includes("/api/v1/suppliers"))
        return response(page(withWorkflowData ? [supplier] : []));
      if (url.includes("/api/v1/materials"))
        return response(page(withWorkflowData ? [material] : []));
      if (url.endsWith("/api/v1/supplier-lots") && method === "POST")
        return response(supplierLot, 201);
      if (url.includes("/api/v1/supplier-lots"))
        return response(page(withWorkflowData ? [supplierLot] : []));
      if (
        url.includes("/api/v1/receipts/21/internal-lots") &&
        method === "POST"
      ) {
        savedLot = {
          ...internalLot,
          internal_lot_no: String(jsonBody.internal_lot_no),
          qty_on_hand: String(jsonBody.qty),
        };
        return response(savedLot, 201);
      }
      if (url.endsWith("/api/v1/receipts") && method === "POST") {
        savedReceipt = {
          ...receipt,
          receipt_no: String(jsonBody.receipt_no),
          qty_received: String(jsonBody.qty_received),
          qty_remaining: String(jsonBody.qty_received),
        };
        return response(savedReceipt, 201);
      }
      if (url.endsWith("/api/v1/receipts/21/trace"))
        return response({
          receipt: savedReceipt ?? receipt,
          supplier,
          material,
          supplier_lot: supplierLot,
          receipt_iqc_records: [],
          internal_lots: savedLot
            ? [
                {
                  internal_lot: savedLot,
                  iqc_records: savedIqc ? [savedIqc] : [],
                },
              ]
            : [],
        });
      if (url.endsWith("/api/v1/receipts/21"))
        return response(savedReceipt ?? receipt);
      if (url.includes("/api/v1/receipts"))
        return response(page(savedReceipt ? [savedReceipt] : []));
      if (url.endsWith("/api/v1/internal-lots/31"))
        return response(savedLot ?? internalLot);
      if (url.includes("/api/v1/internal-lots"))
        return response(page(savedLot ? [savedLot] : []));
      if (url.endsWith("/api/v1/iqc") && method === "POST") {
        savedIqc = {
          id: 41,
          receipt_id: null,
          internal_lot_id: 31,
          inspector_user_id: 7,
          sample_qty: String(jsonBody.sample_qty),
          inspection_result: jsonBody.inspection_result,
          inspection_date: jsonBody.inspection_date,
          release_status: jsonBody.release_status,
          remarks: jsonBody.remarks ?? null,
          created_at: "",
        };
        return response(savedIqc, 201);
      }
      if (url.includes("/api/v1/iqc"))
        return response(page(savedIqc ? [savedIqc] : []));
      if (url.endsWith("/api/v1/auth/logout"))
        return response({ message: "Successfully logged out" });
      return response(page([]));
    },
  );
}

function installSignoffMock() {
  const record = {
    id: 41,
    receipt_id: null as number | null,
    internal_lot_id: 31,
    internal_lot_no: "SEED-ILOT-002-1",
    inspector_user_id: 7,
    sample_qty: '1.0000',
    inspection_result: 'passed',
    inspection_date: '2026-10-19',
    release_status: 'released',
    remarks: null as string | null,
    review_status: 'pending',
    reviewed_by_user_id: null as number | null,
    reviewed_at: null as string | null,
    review_decision_note: null as string | null,
    created_at: '',
  }
  const secondRecord = {
    ...record,
    id: 42,
    internal_lot_id: 32,
    internal_lot_no: 'SEED-ILOT-003-1',
    sample_qty: '2.0000',
    inspection_result: 'failed',
    release_status: 'rejected',
  }
  const reviews: Array<Record<string, unknown>> = []
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    if (url.endsWith('/api/v1/auth/login')) return response({ access_token: 'demo-token', token_type: 'bearer' })
    if (url.endsWith('/api/v1/auth/me')) return response({ id: 7, username: 'seed_qa_1', email: null, is_active: true, roles: ['qa'], permissions: ['quality:review', 'quality:approve', 'quality:return'] })
    if (url.includes('/api/v1/internal-lots')) return response(page([internalLot]))
    if (url.includes('/api/v1/iqc/41/reviews/approve') && method === 'POST') {
      record.review_status = 'approved'
      record.reviewed_by_user_id = 7
      record.reviewed_at = '2026-10-20T02:00:00Z'
      record.review_decision_note = typeof body.decision_note === 'string' ? body.decision_note : null
      const review = { id: reviews.length + 1, iqc_record_id: 41, reviewed_by_user_id: 7, reviewed_by_username: 'seed_qa_1', review_status: 'approved', decision_note: record.review_decision_note, reason: null, reviewed_at: record.reviewed_at, created_at: '' }
      reviews.unshift(review)
      return response(review)
    }
    if (url.includes('/api/v1/iqc/41/reviews/return') && method === 'POST') {
      record.review_status = 'returned'
      record.reviewed_by_user_id = 7
      record.reviewed_at = '2026-10-20T02:10:00Z'
      record.review_decision_note = typeof body.reason === 'string' ? body.reason : null
      const review = { id: reviews.length + 1, iqc_record_id: 41, reviewed_by_user_id: 7, reviewed_by_username: 'seed_qa_1', review_status: 'returned', decision_note: typeof body.decision_note === 'string' ? body.decision_note : null, reason: typeof body.reason === 'string' ? body.reason : null, reviewed_at: record.reviewed_at, created_at: '' }
      reviews.unshift(review)
      return response(review)
    }
    if (url.includes('/api/v1/iqc/41/reviews')) return response(page(reviews))
    if (url.includes('/api/v1/iqc')) {
      const filter = new URL(url).searchParams.get('review_status')
      const items = [record, secondRecord].filter((item) => !filter || filter === item.review_status)
      return response(page(items))
    }
    return response(page([]))
  })
}

async function signIn() {
  await userEvent.type(screen.getByLabelText("帳號"), "qa");
  await userEvent.type(screen.getByLabelText("密碼"), "secret");
  await userEvent.click(screen.getByRole("button", { name: "登入" }));
}

describe("SMTMS application", () => {
  it("shows the nonconformance menu and opens its page for a reader", async () => {
    installApiMock(false, false, true);
    render(<App />);
    await signIn();

    await userEvent.click(await screen.findByRole("link", { name: "品質異常" }));

    expect(await screen.findByRole("heading", { name: "品質異常案件" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/nonconformances"),
      expect.anything(),
    );
  });

  it("hides nonconformance navigation and denies direct route access without read permission", async () => {
    installApiMock();
    render(<App />);
    await signIn();
    expect(screen.queryByRole("link", { name: "品質異常" })).not.toBeInTheDocument();

    window.history.pushState({}, "", "/nonconformances");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByText(/所需權限：nonconformance:read/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/nonconformances"),
      expect.anything(),
    );
  });

  it("keeps sign-off controls out of IQC for QA users", async () => {
    installApiMock(false, true);
    render(<App />);
    await signIn();

    expect(
      await screen.findByRole("link", { name: "品保簽核" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("link", { name: "進料檢驗（IQC）" }),
    );
    expect(
      await screen.findByRole("heading", { name: "進料檢驗（IQC）" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("品保審核簽核")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("選擇簽核目標")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "核准" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "退回" })).not.toBeInTheDocument();
    expect(screen.queryByText("審核歷程")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/reviews"),
      ),
    ).toBe(false);
  });

  it("lets a quality-only user enter sign-off from navigation and approve with visible history", async () => {
    installSignoffMock();
    render(<App />);
    await signIn();
    await userEvent.click(await screen.findByRole("link", { name: "品保簽核" }));
    expect(await screen.findByRole("heading", { name: "品保簽核" })).toBeInTheDocument();
    expect(await screen.findByText("IQC-41")).toBeInTheDocument();
    expect(screen.getAllByText("SEED-ILOT-002-1").length).toBeGreaterThan(0);
    expect(screen.getByText("簽核歷程")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "核准" }));
    await userEvent.click(await screen.findByRole("button", { name: "確認核准" }));
    expect(await screen.findByText(/IQC-41 已核准/)).toBeInTheDocument();
    expect(await screen.findByText("seed_qa_1")).toBeInTheDocument();
  });

  it("shows the selected IQC details left of the list and updates them when another row is selected", async () => {
    installSignoffMock();
    render(<App />);
    await signIn();
    await userEvent.click(await screen.findByRole("link", { name: "品保簽核" }));

    const detailHeading = await screen.findByRole("heading", { name: /檢驗內容與簽核　IQC-41/ });
    const listHeading = screen.getByRole("heading", { name: "待簽核清單" });
    expect(detailHeading.compareDocumentPosition(listHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(screen.getByText("IQC-42"));
    expect(await screen.findByRole("heading", { name: /檢驗內容與簽核　IQC-42/ })).toBeInTheDocument();
    expect(screen.getAllByText("SEED-ILOT-003-1")).toHaveLength(2);
  });

  it("requires a return reason and shows the returned review history", async () => {
    installSignoffMock();
    render(<App />);
    await signIn();
    await userEvent.click(await screen.findByRole("link", { name: "品保簽核" }));
    await screen.findByText("IQC-41");
    await userEvent.click(screen.getByRole("button", { name: "退回" }));
    expect(screen.getAllByText("退回時必須填寫退回理由。").length).toBeGreaterThan(0);
    await userEvent.type(
      screen.getByRole("textbox", { name: /退回理由（退回時必填）/ }),
      "請補交檢驗報告",
    );
    await userEvent.click(screen.getByRole("button", { name: "退回" }));
    await userEvent.click(await screen.findByRole("button", { name: "確認退回" }));
    expect(await screen.findByText(/IQC-41 已退回/)).toBeInTheDocument();
    expect(await screen.findByText(/退回理由：請補交檢驗報告/)).toBeInTheDocument();
    expect(screen.getAllByText("已退回").length).toBeGreaterThan(0);
  });

  it("redirects unauthenticated users and logs in with a valid token", async () => {
    installApiMock();
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "登入 SMTMS" }),
    ).toBeInTheDocument();
    await signIn();
    expect(window.localStorage.getItem("smtms_token")).toBe("demo-token");
    expect(
      await screen.findByRole("heading", { name: "儀表板" }),
    ).toBeInTheDocument();
  });

  it("completes receipt creation, internal lot split, and pending IQC with backend-confirmed statuses", async () => {
    installApiMock(true);
    render(<App />);
    await signIn();
    await screen.findByRole("heading", { name: "儀表板" });
    await userEvent.click(screen.getByRole("link", { name: "收料紀錄" }));
    await screen.findByRole("heading", { name: "收料紀錄" });
    await userEvent.click(screen.getByRole("button", { name: "新增收料紀錄" }));

    await userEvent.click(
      screen.getByRole("button", { name: "新增供應商批號" }),
    );
    const supplierSelects = await screen.findAllByLabelText("供應商");
    const materialSelects = screen.getAllByLabelText("物料");
    await userEvent.selectOptions(supplierSelects[0], "4");
    await userEvent.selectOptions(materialSelects[0], "8");
    await userEvent.type(
      await screen.findByRole("textbox", { name: /供應商批號/ }),
      "SUPLOT-13",
    );
    await userEvent.type(
      await screen.findByRole("spinbutton", { name: /批號申報/ }),
      "100",
    );
    await userEvent.click(screen.getByRole("button", { name: "確認批號資料" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "建立批號" }),
    );
    expect(
      await screen.findByText(/供應商批號「SUPLOT-13」已建立/),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("收料單號"), "RCV-TEST-21");
    await userEvent.type(screen.getByLabelText("收料數量"), "12");
    await userEvent.click(screen.getByRole("button", { name: "確認收料資料" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "建立收料紀錄" }),
    );
    expect(
      await screen.findByText(/收料單 RCV-TEST-21 已建立/),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("內部批號"), "LOT-TEST-31");
    await userEvent.type(screen.getByLabelText(/拆分數量/), "5");
    await userEvent.click(screen.getByRole("button", { name: "建立批號" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "建立內部批號" }),
    );
    expect((await screen.findAllByText("待檢隔離")).length).toBeGreaterThan(0);
    expect(await screen.findByText("來源與品質追溯")).toBeInTheDocument();
    expect((await screen.findAllByText("SUPLOT-13")).length).toBeGreaterThan(0);

    await userEvent.click(
      screen.getByRole("link", { name: "進料檢驗（IQC）" }),
    );
    await screen.findByRole("heading", { name: "進料檢驗（IQC）" });
    await userEvent.selectOptions(
      await screen.findByLabelText(/內部批號/),
      "31",
    );
    await userEvent.type(screen.getByLabelText("抽樣數量"), "1");
    await userEvent.click(screen.getByRole("button", { name: "確認檢驗資料" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "儲存檢驗紀錄" }),
    );
    expect(await screen.findByText(/結果：待檢／暫緩放行/)).toBeInTheDocument();
    expect(await screen.findByText("後端確認的批號狀態")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/iqc"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"release_status":"hold"'),
      }),
    );
    await userEvent.click(screen.getByRole("link", { name: "收料紀錄" }));
    expect(await screen.findByText("來源與品質追溯")).toBeInTheDocument();
    expect(await screen.findByText(/IQC-41/)).toBeInTheDocument();
    expect(screen.getAllByText("待檢隔離").length).toBeGreaterThan(0);
  });

  it("searches and displays a complete multi-branch traceability chain", async () => {
    const trace = {
      receipt: { ...receipt, receipt_no: "TRACE-REC-1" },
      supplier,
      material,
      supplier_lot: supplierLot,
      receipt_iqc_records: [],
      internal_lots: [
        {
          internal_lot: {
            ...internalLot,
            id: 31,
            internal_lot_no: "TRACE-LOT-A",
          },
          iqc_records: [],
        },
        {
          internal_lot: {
            ...internalLot,
            id: 32,
            internal_lot_no: "TRACE-LOT-B",
          },
          iqc_records: [],
        },
      ],
    };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/login"))
        return response({ access_token: "demo-token", token_type: "bearer" });
      if (url.endsWith("/api/v1/auth/me"))
        return response({
          id: 7,
          username: "qa",
          email: null,
          is_active: true,
          roles: ["quality"],
          permissions: ["receipts:read", "materials:read", "iqc:read"],
        });
      if (url.includes("/api/v1/traceability")) return response(page([trace]));
      return response(page([]));
    });

    render(<App />);
    await signIn();
    await userEvent.click(
      await screen.findByRole("link", { name: "全鏈路追溯" }),
    );
    await userEvent.type(screen.getByLabelText("識別值"), "TRACE-REC-1");
    await userEvent.click(screen.getByRole("button", { name: "查詢追溯鏈" }));

    expect(await screen.findByText("TRACE-LOT-A")).toBeInTheDocument();
    expect(screen.getByText("TRACE-LOT-B")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "匯出當前頁 CSV" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/traceability?receipt_no=TRACE-REC-1"),
      expect.anything(),
    );
  });

  it("exports only the current trace page and preserves each internal-lot branch", () => {
    const firstPage = {
      receipt: { ...receipt, receipt_no: "TRACE-PAGE-1" },
      supplier,
      material,
      supplier_lot: supplierLot,
      receipt_iqc_records: [],
      internal_lots: [
        {
          internal_lot: {
            ...internalLot,
            id: 31,
            internal_lot_no: "PAGE-LOT-A",
          },
          iqc_records: [],
        },
        {
          internal_lot: {
            ...internalLot,
            id: 32,
            internal_lot_no: "PAGE-LOT-B",
          },
          iqc_records: [],
        },
      ],
    };
    const csv = buildTraceabilityPageCsv([firstPage]);

    expect(csv).toContain("TRACE-PAGE-1");
    expect(csv).toContain("PAGE-LOT-A");
    expect(csv).toContain("PAGE-LOT-B");
    expect(csv).not.toContain("TRACE-PAGE-2");
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});
