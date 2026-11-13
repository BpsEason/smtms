import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { DashboardPage } from "../../src/pages/DashboardPage";
import type {
  DashboardSummary,
  DashboardTodos,
  IQCRecord,
  Nonconformance,
  PaginatedResponse,
  QualityTrendResponse,
  Receipt,
  UserProfile,
} from "../../src/types";

const getDashboardSummaryMock = vi.fn();
const getDashboardTodosMock = vi.fn();
const listReceiptsMock = vi.fn();
const getQualityTrendMock = vi.fn();
const getIQCRecordMock = vi.fn();
const getNonconformanceMock = vi.fn();
const downloadNonconformanceAttachmentMock = vi.fn();

vi.mock("../../src/api", async () => {
  const actual = await vi.importActual<typeof import("../../src/api")>("../../src/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getDashboardSummary: (...args: unknown[]) => getDashboardSummaryMock(...args),
      getDashboardTodos: (...args: unknown[]) => getDashboardTodosMock(...args),
      listReceipts: (...args: unknown[]) => listReceiptsMock(...args),
      getQualityTrend: (...args: unknown[]) => getQualityTrendMock(...args),
      getIQCRecord: (...args: unknown[]) => getIQCRecordMock(...args),
      getNonconformance: (...args: unknown[]) => getNonconformanceMock(...args),
      downloadNonconformanceAttachment: (...args: unknown[]) =>
        downloadNonconformanceAttachmentMock(...args),
    },
  };
});

const ALL_PERMISSIONS = [
  "receipts:read",
  "materials:read",
  "iqc:read",
  "nonconformance:read",
];

const emptyReceipts: PaginatedResponse<Receipt> = {
  items: [],
  total: 0,
  page: 1,
  page_size: 8,
};

const emptyTrend: QualityTrendResponse = [];

const emptyTodos: DashboardTodos = {
  pending_iqc: [],
  open_nc: [],
};

const defaultSummary: DashboardSummary = {
  receipts: { total: 0 },
  internal_lots: { total: 0, by_lot_status: {} },
  iqc: { total: 0, pending_review: 0, passed: 0, failed: 0 },
  nonconformances: { total: 0, open: 0, closed: 0 },
};

const todos: DashboardTodos = {
  pending_iqc: [
    {
      type: "pending_iqc",
      id: 101,
      internal_lot_no: "LOT-INT-1",
      receipt_no: "RC-2026-001",
      supplier_code: "SUP-001",
      supplier_name: "Test Supplier",
      material_code: "MAT-001",
      material_name: "Test Material",
      inspection_result: "pending",
      review_status: "pending",
      created_at: "2026-11-01T02:00:00Z",
      detail_path: "/iqc/101",
    },
  ],
  open_nc: [
    {
      type: "open_nc",
      id: 501,
      case_no: "NC-2026-001",
      title: "IQC inspection anomaly",
      status: "investigating",
      severity: "high",
      supplier_code: "SUP-001",
      supplier_name: "Test Supplier",
      material_code: "MAT-001",
      material_name: "Test Material",
      found_at: "2026-11-02T02:00:00Z",
      detail_path: "/nonconformances/501",
    },
  ],
};

const iqcDetail: IQCRecord = {
  id: 101,
  receipt_id: 9001,
  internal_lot_id: 7001,
  internal_lot_no: "LOT-INT-1",
  inspector_user_id: 3,
  sample_qty: "5.0000",
  inspection_result: "pending",
  inspection_date: "2026-11-01T02:00:00Z",
  release_status: "hold",
  remarks: "remark line one\nremark line two",
  review_status: "pending",
  reviewed_by_user_id: null,
  reviewed_at: null,
  review_decision_note: null,
  created_at: "2026-11-01T02:00:00Z",
};

const ncDetail: Nonconformance = {
  id: 501,
  case_no: "NC-2026-001",
  title: "IQC inspection anomaly",
  description: "description line one\ndescription line two",
  source: "iqc",
  severity: "high",
  status: "investigating",
  found_at: "2026-11-02T02:00:00Z",
  found_by_user_id: 3,
  owner_user_id: 5,
  supplier_id: 9001,
  material_id: 7001,
  receipt_id: 9101,
  supplier_lot_id: 8001,
  internal_lot_id: 7001,
  iqc_record_id: 101,
  defect_qty: "12.5000",
  investigation: "investigation confirmed",
  closed_at: null,
  created_at: "2026-11-02T03:00:00Z",
  updated_at: "2026-11-02T04:00:00Z",
  dispositions: [
    {
      id: 1,
      content: "quarantine the remaining stock",
      result: "quarantine finished",
      owner_user_id: 5,
      executed_at: "2026-11-02T05:00:00Z",
    },
  ],
  history: [
    {
      id: 1,
      action: "created",
      actor_user_id: 3,
      before_data: null,
      after_data: { case: { case_no: "NC-2026-001", status: "open" } } as unknown as string,
      created_at: "2026-11-02T03:00:00Z",
    },
    {
      id: 2,
      action: "updated",
      actor_user_id: 5,
      before_data: "plain text not json",
      after_data: '{"status":"investigating"}',
      created_at: "2026-11-02T04:00:00Z",
    },
  ],
  attachments: [
    {
      id: 11,
      original_filename: "defect-photo.png",
      media_type: "image/png",
      size_bytes: 2048,
      sha256: "abc",
      created_at: "2026-11-02T06:00:00Z",
    },
  ],
};

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderPage(profile: UserProfile | null) {
  const client = createClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage profile={profile} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function profileWith(perms: string[]): UserProfile {
  return {
    id: 1,
    username: "u",
    email: null,
    is_active: true,
    roles: [],
    permissions: perms,
  };
}

beforeEach(() => {
  getDashboardSummaryMock.mockReset();
  getDashboardTodosMock.mockReset();
  listReceiptsMock.mockReset();
  getQualityTrendMock.mockReset();
  getIQCRecordMock.mockReset();
  getNonconformanceMock.mockReset();
  downloadNonconformanceAttachmentMock.mockReset();

  getDashboardSummaryMock.mockResolvedValue(defaultSummary);
  getDashboardTodosMock.mockResolvedValue(emptyTodos);
  listReceiptsMock.mockResolvedValue(emptyReceipts);
  getQualityTrendMock.mockResolvedValue(emptyTrend);
  getIQCRecordMock.mockResolvedValue(iqcDetail);
  getNonconformanceMock.mockResolvedValue(ncDetail);
  downloadNonconformanceAttachmentMock.mockResolvedValue(new Blob(["x"]));
});

describe("DashboardPage summary blocks", () => {
  it("shows full summary blocks and keeps recent receipts list", async () => {
    const summary: DashboardSummary = {
      receipts: { total: 3 },
      internal_lots: { total: 4, by_lot_status: { available: 2, quarantine: 1, rejected: 1 } },
      iqc: { total: 10, pending_review: 2, passed: 7, failed: 1 },
      nonconformances: { total: 5, open: 3, closed: 2 },
    };
    getDashboardSummaryMock.mockResolvedValue(summary);
    listReceiptsMock.mockResolvedValue({
      items: [
        {
          id: 1,
          supplier_id: 1,
          material_id: 1,
          supplier_lot_id: 1,
          receipt_no: "RCV-001",
          received_at: "2026-11-01T00:00:00Z",
          received_by_user_id: null,
          qty_received: "10",
          qty_remaining: "5",
          status: "received",
          notes: null,
          created_at: "2026-11-01T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      page_size: 8,
    } satisfies PaginatedResponse<Receipt>);

    renderPage(
      profileWith([
        "receipts:read",
        "materials:read",
        "iqc:read",
        "nonconformance:read",
      ]),
    );

    expect(await screen.findByText("收料統計")).toBeTruthy();
    expect(screen.getByText("內部批號統計")).toBeTruthy();
    expect(screen.getByText("IQC 品質統計")).toBeTruthy();
    expect(screen.getByText("不合格案件統計")).toBeTruthy();
    expect(screen.getByText("批號狀態分布")).toBeTruthy();

    // dynamic by_lot_status rows (status labels come from the summary payload)
    expect(screen.getByText("available").parentElement?.textContent).toContain("2");
    expect(screen.getByText("available").parentElement?.textContent).toContain("50%");
    expect(screen.getByText("quarantine").parentElement?.textContent).toContain("25%");
    expect(screen.getByText("rejected").parentElement?.textContent).toContain("25%");
    expect(screen.getByText(/共 3 種狀態 · 狀態數量合計 4/)).toBeTruthy();

    // recent receipts preserved (separate query)
    expect(await screen.findByText("RCV-001")).toBeTruthy();
    expect(screen.getByRole("link", { name: /查看收料紀錄/ })).toBeTruthy();
    expect(getDashboardSummaryMock).toHaveBeenCalledTimes(1);
    expect(listReceiptsMock).toHaveBeenCalledWith({ page: 1, page_size: 8 });
  });

  it("shows only receipts block when summary contains only receipts", async () => {
    getDashboardSummaryMock.mockResolvedValue({ receipts: { total: 9 } });

    renderPage(profileWith(["receipts:read"]));

    expect(await screen.findByText("收料統計")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.queryByText("內部批號統計")).toBeNull();
    expect(screen.queryByText("IQC 品質統計")).toBeNull();
    expect(screen.queryByText("不合格案件統計")).toBeNull();
  });

  it("shows only internal_lots block when summary contains only internal_lots", async () => {
    getDashboardSummaryMock.mockResolvedValue({
      internal_lots: { total: 0, by_lot_status: {} },
    });

    renderPage(profileWith(["materials:read"]));

    expect(await screen.findByText("內部批號統計")).toBeTruthy();
    expect(screen.getByText("尚無批號狀態資料")).toBeTruthy();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.queryByText("收料統計")).toBeNull();
    expect(screen.queryByText("IQC 品質統計")).toBeNull();
    expect(screen.queryByText("不合格案件統計")).toBeNull();
  });

  it("shows only iqc block when summary contains only iqc", async () => {
    getDashboardSummaryMock.mockResolvedValue({
      iqc: { total: 0, pending_review: 0, passed: 0, failed: 0 },
    });

    renderPage(profileWith(["iqc:read"]));

    expect(await screen.findByText("IQC 品質統計")).toBeTruthy();
    expect(screen.getByText("待審核")).toBeTruthy();
    expect(screen.queryByText("收料統計")).toBeNull();
    expect(screen.queryByText("內部批號統計")).toBeNull();
    expect(screen.queryByText("不合格案件統計")).toBeNull();
  });

  it("shows only nonconformances block when summary contains only nonconformances", async () => {
    getDashboardSummaryMock.mockResolvedValue({
      nonconformances: { total: 2, open: 2, closed: 0 },
    });

    renderPage(profileWith(["nonconformance:read"]));

    expect(await screen.findByText("不合格案件統計")).toBeTruthy();
    expect(screen.getByText("未結案")).toBeTruthy();
    expect(screen.queryByText("收料統計")).toBeNull();
    expect(screen.queryByText("內部批號統計")).toBeNull();
    expect(screen.queryByText("IQC 品質統計")).toBeNull();
  });

  it("handles 403 summary without showing blank stat cards", async () => {
    getDashboardSummaryMock.mockRejectedValue(new ApiError(403, "Forbidden"));

    renderPage(profileWith(["iqc:read"]));

    expect(await screen.findByText("沒有可讀取的儀表板統計", undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText("收料統計")).toBeNull();
    expect(screen.queryByText("內部批號統計")).toBeNull();
    expect(screen.queryByText("IQC 品質統計")).toBeNull();
    expect(screen.queryByText("不合格案件統計")).toBeNull();
  });

  it("shows summary error state with retry", async () => {
    getDashboardSummaryMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ nonconformances: { total: 1, open: 1, closed: 0 } });

    renderPage(profileWith(["nonconformance:read"]));

    await waitFor(
      () => expect(screen.queryByText("正在載入儀表板資料…")).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(await screen.findByText(/儀表板統計：/)).toBeTruthy();
    const user = userEvent.setup();
    const refreshButton = screen.getByRole("button", { name: /重新整理/ });
    await waitFor(() => expect(refreshButton).not.toBeDisabled(), { timeout: 3000 });
    await user.click(refreshButton);

    expect(await screen.findByText("不合格案件統計")).toBeTruthy();
    await waitFor(() => expect(getDashboardSummaryMock).toHaveBeenCalledTimes(3));
  });

  it("shows loading then data", async () => {
    let resolveSummary!: (value: DashboardSummary) => void;
    getDashboardSummaryMock.mockReturnValue(
      new Promise<DashboardSummary>((resolve) => {
        resolveSummary = resolve;
      }),
    );

    renderPage(profileWith(["nonconformance:read"]));

    expect(screen.getByText("正在載入儀表板資料…")).toBeTruthy();
    resolveSummary({ nonconformances: { total: 0, open: 0, closed: 0 } });
    expect(await screen.findByText("不合格案件統計")).toBeTruthy();
  });
});

describe("DashboardPage detail dialogs", () => {
  beforeEach(() => {
    getDashboardTodosMock.mockResolvedValue(todos);
  });

  it("renders receipt total and internal lot status distribution with percentages", async () => {
    getDashboardSummaryMock.mockResolvedValue({
      ...defaultSummary,
      receipts: { total: 1234 },
      internal_lots: { total: 10, by_lot_status: { available: 7, quarantine: 3 } },
    });

    renderPage(profileWith(ALL_PERMISSIONS));

    const availableRow = (await screen.findByText("available")).parentElement!;
    expect(availableRow.textContent).toContain("7");
    expect(availableRow.textContent).toContain("70%");
    expect(availableRow.nextElementSibling?.className).toContain("ant-progress");

    expect(screen.getByText("quarantine").parentElement?.textContent).toContain("30%");
    expect(screen.getByText(/共 2 種狀態 · 狀態數量合計 10/)).toBeInTheDocument();
    expect(screen.queryByText("批號狀態")).not.toBeInTheDocument();

    const receiptCard = screen.getByText("收料統計").closest<HTMLElement>(".ant-card")!;
    expect(within(receiptCard).getByText("收料總數")).toBeInTheDocument();
    expect(within(receiptCard).getByText("1,234")).toBeInTheDocument();
  });

  it("renders the empty status distribution when no lot status is available", async () => {
    renderPage(profileWith(ALL_PERMISSIONS));

    expect(await screen.findByText("尚無批號狀態資料")).toBeInTheDocument();
  });

  it("opens the IQC detail dialog with sections and closes it", async () => {
    const user = userEvent.setup();
    renderPage(profileWith(ALL_PERMISSIONS));

    const row = (await screen.findByText("RC-2026-001")).closest("tr");
    expect(row).not.toBeNull();

    await user.click(within(row!).getByRole("button", { name: "詳細" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("IQC-101").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Test Supplier (SUP-001)").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Test Material (MAT-001)")).toBeInTheDocument();
    expect(within(dialog).getByText("RC-2026-001")).toBeInTheDocument();
    expect(within(dialog).getByText("LOT-INT-1")).toBeInTheDocument();
    expect(within(dialog).getByText(/remark line one/)).toBeInTheDocument();
    expect(within(dialog).getByText(/remark line one[\s\S]*remark line two/)).toBeInTheDocument();
    expect(within(dialog).getByText("抽樣數量")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /關\s*閉/ }));

    await waitFor(() => {
      const modal = document.querySelector(".ant-modal");
      expect(modal === null || modal.className.includes("ant-zoom-leave")).toBe(true);
    });
  }, 20000);

  it("renders the nonconformance detail dialog without react child errors", async () => {
    const user = userEvent.setup();
    renderPage(profileWith(ALL_PERMISSIONS));

    const row = (await screen.findByText("NC-2026-001")).closest("tr");
    expect(row).not.toBeNull();

    await user.click(within(row!).getByRole("button", { name: "詳細" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("IQC inspection anomaly")).toBeInTheDocument();
    expect(within(dialog).getByText("NC-2026-001")).toBeInTheDocument();
    expect(within(dialog).getByText("Test Supplier (SUP-001)")).toBeInTheDocument();
    expect(within(dialog).getByText("Test Material (MAT-001)")).toBeInTheDocument();
    const defectStatistic = within(dialog).getByText("不良數量").closest(".ant-statistic");
    expect(defectStatistic?.textContent).toContain("12.5");
    expect(within(dialog).getAllByText("使用者 #5").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("quarantine the remaining stock")).toBeInTheDocument();
    expect(within(dialog).getByText("defect-photo.png")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "下載" })).toBeInTheDocument();
    const afterHeaders = within(dialog).getAllByText("異動後");
    const beforeHeaders = within(dialog).getAllByText("異動前");
    expect(afterHeaders.length).toBeGreaterThan(0);
    await user.click(afterHeaders[0]);
    await waitFor(() => {
      expect(within(dialog).getByText(/"status": "open"/)).toBeInTheDocument();
    });
    await user.click(beforeHeaders[1]);
    await waitFor(() => {
      expect(within(dialog).getByText("plain text not json")).toBeInTheDocument();
    });
    await user.click(afterHeaders[1]);
    await waitFor(() => {
      expect(within(dialog).getByText(/"status": "investigating"/)).toBeInTheDocument();
    });

    await user.click(within(dialog).getByRole("button", { name: /關\s*閉/ }));

    await waitFor(() => {
      const modal = document.querySelector(".ant-modal");
      expect(modal === null || modal.className.includes("ant-zoom-leave")).toBe(true);
    });
  }, 20000);
});