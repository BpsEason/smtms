import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import type {
  DashboardSummary,
  DashboardTodos,
  IQCRecord,
  Nonconformance,
  PaginatedResponse,
  QualityTrendResponse,
  Receipt,
  UserProfile,
} from "../types";

vi.mock("../api", () => {
  class ApiError extends Error {
    status: number;
    details: string;

    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = message;
    }
  }

  return {
    ApiError,
    api: {
      listReceipts: vi.fn(),
      getDashboardSummary: vi.fn(),
      getDashboardTodos: vi.fn(),
      getQualityTrend: vi.fn(),
      getIQCRecord: vi.fn(),
      getNonconformance: vi.fn(),
      downloadNonconformanceAttachment: vi.fn(),
    },
  };
});

import { api } from "../api";

const mockedApi = vi.mocked(api, true);

const profile: UserProfile = {
  id: 1,
  username: "qa",
  email: null,
  is_active: true,
  roles: ["qa"],
  permissions: ["receipts:read", "materials:read", "iqc:read", "nonconformance:read"],
};

const receipts: PaginatedResponse<Receipt> = {
  items: [],
  total: 0,
  page: 1,
  page_size: 8,
};

const summary: DashboardSummary = {
  receipts: { total: 0 },
  internal_lots: { total: 0, by_lot_status: {} },
  iqc: { total: 0, pending_review: 0, passed: 0, failed: 0 },
  nonconformances: { total: 0, open: 0, closed: 0 },
};

const trend: QualityTrendResponse = [];

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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage profile={profile} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage detail dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.listReceipts.mockResolvedValue(receipts);
    mockedApi.getDashboardSummary.mockResolvedValue(summary);
    mockedApi.getDashboardTodos.mockResolvedValue(todos);
    mockedApi.getQualityTrend.mockResolvedValue(trend);
    mockedApi.getIQCRecord.mockResolvedValue(iqcDetail);
    mockedApi.getNonconformance.mockResolvedValue(ncDetail);
    mockedApi.downloadNonconformanceAttachment.mockResolvedValue(new Blob(["x"]));
  });

  it("renders receipt total and internal lot status distribution with percentages", async () => {
    mockedApi.getDashboardSummary.mockResolvedValue({
      ...summary,
      receipts: { total: 1234 },
      internal_lots: { total: 10, by_lot_status: { available: 7, quarantine: 3 } },
    });

    renderPage();

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
    renderPage();

    expect(await screen.findByText("尚無批號狀態資料")).toBeInTheDocument();
  });

  it("opens the IQC detail dialog with sections and closes it", async () => {
    const user = userEvent.setup();
    renderPage();

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
    renderPage();

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