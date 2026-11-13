import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { DashboardPage } from "../../src/pages/DashboardPage";
import type {
  DashboardSummary,
  DashboardTodos,
  PaginatedResponse,
  QualityTrendResponse,
  Receipt,
  UserProfile,
} from "../../src/types";

const getDashboardSummaryMock = vi.fn();
const getDashboardTodosMock = vi.fn();
const listReceiptsMock = vi.fn();
const getQualityTrendMock = vi.fn();

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
    },
  };
});

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

beforeEach(() => {
  getQualityTrendMock.mockResolvedValue(emptyTrend);
  getDashboardTodosMock.mockResolvedValue(emptyTodos);
});

afterEach(() => {
  getDashboardSummaryMock.mockReset();
  getDashboardTodosMock.mockReset();
  listReceiptsMock.mockReset();
  getQualityTrendMock.mockReset();
});

describe("DashboardPage", () => {
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
    listReceiptsMock.mockResolvedValue(emptyReceipts);

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
