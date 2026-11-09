
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ClipboardCheck,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatErrorMessage } from "../lib/error";
import {
  buttonClass,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  Panel,
  StatusBadge,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../components/ui";
import type {
  InternalLot,
  IQCRecord,
  PaginatedResponse,
  Receipt,
  UserProfile,
} from "../types";

const taiwanDateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatTaiwanDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return taiwanDateFormatter.format(date);
}

export function DashboardPage({ profile }: { profile: UserProfile | null }) {
  const can = useCallback(
    (permission: string) => Boolean(profile?.permissions.includes(permission)),
    [profile],
  );

  const receiptsQuery = useQuery<PaginatedResponse<Receipt>>({
    queryKey: ["dashboard", "receipts"],
    queryFn: async () => api.listReceipts({ page: 1, page_size: 8 }),
    enabled: can("receipts:read"),
    retry: 1,
    staleTime: 30 * 1000,
  });

  const lotsQuery = useQuery<PaginatedResponse<InternalLot>>({
    queryKey: ["dashboard", "lots"],
    queryFn: async () => api.listInternalLots({ page: 1, page_size: 1 }),
    enabled: can("materials:read"),
    retry: 1,
    staleTime: 30 * 1000,
  });

  const iqcQuery = useQuery<PaginatedResponse<IQCRecord>>({
    queryKey: ["dashboard", "iqc"],
    queryFn: async () => api.listIQCRecords({ page: 1, page_size: 1 }),
    enabled: can("iqc:read"),
    retry: 1,
    staleTime: 30 * 1000,
  });

  const pendingQuery = useQuery<PaginatedResponse<IQCRecord>>({
    queryKey: ["dashboard", "pending"],
    queryFn: async () =>
      api.listIQCRecords({ review_status: "pending", page: 1, page_size: 1 }),
    enabled: can("iqc:read"),
    retry: 1,
    staleTime: 30 * 1000,
  });

  const handleRefresh = () => {
    void Promise.all([
      receiptsQuery.refetch(),
      lotsQuery.refetch(),
      iqcQuery.refetch(),
      pendingQuery.refetch(),
    ]);
  };

  const loading =
    receiptsQuery.isLoading ||
    lotsQuery.isLoading ||
    iqcQuery.isLoading ||
    pendingQuery.isLoading;

  const errors: string[] = [];
  if (receiptsQuery.error)
    errors.push(`收料紀錄：${formatErrorMessage(receiptsQuery.error)}`);
  if (lotsQuery.error)
    errors.push(`內部批號：${formatErrorMessage(lotsQuery.error)}`);
  if (iqcQuery.error)
    errors.push(`IQC 紀錄：${formatErrorMessage(iqcQuery.error)}`);
  if (pendingQuery.error)
    errors.push(`待審核項目：${formatErrorMessage(pendingQuery.error)}`);

  const metrics = [
    can("receipts:read") &&
      receiptsQuery.data && {
        label: "收料紀錄",
        value: receiptsQuery.data.total,
        detail: "收料查詢回傳的紀錄總數",
      },

    can("materials:read") &&
      lotsQuery.data && {
        label: "內部批號",
        value: lotsQuery.data.total,
        detail: "內部批號紀錄總數",
      },

    can("iqc:read") &&
      iqcQuery.data && {
        label: "IQC 紀錄",
        value: iqcQuery.data.total,
        detail: "進料檢驗紀錄總數",
      },

    can("iqc:read") &&
      pendingQuery.data && {
        label: "待審核",
        value: pendingQuery.data.total,
        detail: "品保審核狀態為待審核的紀錄數",
      },
  ].filter(
    (item): item is { label: string; value: number; detail: string } =>
      Boolean(item),
  );

  const receipts = receiptsQuery.data;
  const pending = pendingQuery.data;

  return (
    <section>
      <PageHeader
        eyebrow="品保作業"
        title="儀表板"
        description="即時作業摘要。筆數依目前 API 查詢結果統計；目前尚無品質 KPI 與趨勢彙總資料。"
        action={
          <button
            type="button"
            className={buttonClass}
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            重新整理
          </button>
        }
      />

      {loading && <LoadingState label="正在載入即時作業資料…" />}

      {errors.length > 0 && (
        <div className="mb-5 space-y-2">
          {errors.map((error) => (
            <ErrorState key={error} message={error} />
          ))}
        </div>
      )}

      {!loading && metrics.length === 0 ? (
        <Panel
          title="無法讀取資料"
          description="僅在目前帳號具備來源資料讀取權限時顯示儀表板統計。"
        >
          <EmptyState
            title="沒有可讀取的品保資料"
            description="請洽系統管理員確認收料、物料或 IQC 的讀取權限。"
          />
        </Panel>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-6 border-y border-slate-200 bg-white py-5 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Metric key={metric.label} {...metric} />
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
        {can("receipts:read") && (
          <Panel
            title="最近收料紀錄"
            description="目前收料清單回傳的最新紀錄。"
            action={
              <Link
                to="/receipts"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 hover:text-sky-950"
              >
                查看收料紀錄
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {loading ? (
              <LoadingState />
            ) : receipts?.items.length ? (
              <DataTable>
                <TableHead>
                  <TableRow>
                    <Th>收料單號</Th>
                    <Th>收料日期</Th>
                    <Th>剩餘數量</Th>
                    <Th>狀態</Th>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {receipts.items.slice(0, 6).map((receipt) => (
                    <TableRow key={receipt.id}>
                      <Td className="font-medium text-slate-900">
                        {receipt.receipt_no}
                      </Td>

                      <Td>{formatTaiwanDate(receipt.received_at)}</Td>

                      <Td>{receipt.qty_remaining}</Td>

                      <Td>
                        <StatusBadge value={receipt.status} />
                      </Td>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : errors.some((item) => item.startsWith("收料紀錄：")) ? (
              <EmptyState
                title="收料資料讀取失敗"
                description="請依上方錯誤訊息重試；目前無法判斷是否有收料資料。"
              />
            ) : (
              <EmptyState
                title="尚無收料紀錄"
                description="建立收料紀錄後，資料會顯示於此。"
              />
            )}
          </Panel>
        )}

        <Panel
          title="品保待辦"
          description="待審核數量依後端審核狀態欄位篩選。"
        >
          {!can("iqc:read") ? (
            <EmptyState
              title="沒有 IQC 讀取權限"
              description="目前帳號無法讀取進料檢驗紀錄。"
            />
          ) : loading ? (
            <LoadingState />
          ) : pending ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-amber-50 text-amber-700">
                  <ClipboardCheck className="h-5 w-5" />
                </span>

                <div>
                  <p className="text-2xl font-semibold tabular-nums text-slate-950">
                    {pending.total}
                  </p>
                  <p className="text-xs text-slate-500">
                    品保審核待處理
                  </p>
                </div>
              </div>

              <Link
                to="/iqc"
                className="text-sm font-medium text-sky-800 hover:text-sky-950"
              >
                查看 IQC
              </Link>
            </div>
          ) : (
            <EmptyState title="目前無法載入待辦" />
          )}

          {can("materials:read") && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <PackageCheck className="h-4 w-4" />
                內部批號可於追溯作業中查詢。
              </div>

              <Link
                to="/internal-lots"
                className="mt-2 inline-block text-xs font-semibold text-sky-800"
              >
                瀏覽內部批號
              </Link>
            </div>
          )}
        </Panel>
      </div>

      <p className="mt-5 text-xs text-slate-500">
        儀表板統計來源為分頁 API 回傳總數；不會依部分清單推算良率、不良率或趨勢。
      </p>
    </section>
  );
}
