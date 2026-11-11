import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ClipboardCheck, PackageCheck, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api";
import { formatErrorMessage } from "../lib/error";
import {
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
  buttonClass,
} from "../components/ui";
import { QualityTrendChart } from "../components/QualityTrendChart";
import type {
  DashboardSummary,
  DashboardTodos,
  PaginatedResponse,
  QualityTrendResponse,
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

const IQC_SUMMARY_PERMISSIONS = [
  "iqc:read",
  "quality:review",
  "quality:approve",
  "quality:return",
];

export function DashboardPage({ profile }: { profile: UserProfile | null }) {
  const can = useCallback(
    (permission: string) => Boolean(profile?.permissions.includes(permission)),
    [profile],
  );
  const canAny = useCallback(
    (permissions: string[]) => permissions.some((permission) => can(permission)),
    [can],
  );

  const canReadReceipts = can("receipts:read");
  const canReadMaterials = can("materials:read");
  const canReadIQCSummary = canAny(IQC_SUMMARY_PERMISSIONS);
  const canReadNonconformances = can("nonconformance:read");
  const canReadQualityTrend = canReadIQCSummary;
  const canReadDashboardSummary =
    canReadReceipts || canReadMaterials || canReadIQCSummary || canReadNonconformances;
  const canReadTodos = canReadIQCSummary || canReadNonconformances;

  const receiptsQuery = useQuery<PaginatedResponse<Receipt>>({
    queryKey: ["dashboard", "receipts", "recent"],
    queryFn: () => api.listReceipts({ page: 1, page_size: 8 }),
    enabled: canReadReceipts,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const summaryQuery = useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: () => api.getDashboardSummary(),
    enabled: canReadDashboardSummary,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const todosQuery = useQuery<DashboardTodos>({
    queryKey: ["dashboard", "todos"],
    queryFn: () => api.getDashboardTodos(),
    enabled: canReadTodos,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const trendQuery = useQuery<QualityTrendResponse>({
    queryKey: ["dashboard", "quality-trend"],
    queryFn: () => api.getQualityTrend(),
    enabled: canReadQualityTrend,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const handleRefresh = () => {
    const tasks: Array<Promise<unknown>> = [];
    if (canReadReceipts) tasks.push(receiptsQuery.refetch());
    if (canReadDashboardSummary) tasks.push(summaryQuery.refetch());
    if (canReadTodos) tasks.push(todosQuery.refetch());
    if (canReadQualityTrend) tasks.push(trendQuery.refetch());
    void Promise.all(tasks);
  };

  const summary = summaryQuery.data;
  const todos = todosQuery.data;
  const trend = trendQuery.data ?? [];
  const summaryForbidden =
    summaryQuery.error instanceof ApiError && summaryQuery.error.status === 403;
  const summaryError = summaryQuery.error && !summaryForbidden ? summaryQuery.error : null;
  const todosForbidden =
    todosQuery.error instanceof ApiError && todosQuery.error.status === 403;
  const todosError = todosQuery.error && !todosForbidden ? todosQuery.error : null;
  const trendForbidden =
    trendQuery.error instanceof ApiError && trendQuery.error.status === 403;
  const trendError = trendQuery.error && !trendForbidden ? trendQuery.error : null;

  const loading =
    (canReadReceipts && receiptsQuery.isLoading) ||
    (canReadDashboardSummary && summaryQuery.isLoading) ||
    (canReadTodos && todosQuery.isLoading) ||
    (canReadQualityTrend && trendQuery.isLoading);
  const refreshing =
    (canReadReceipts && receiptsQuery.isFetching) ||
    (canReadDashboardSummary && summaryQuery.isFetching) ||
    (canReadTodos && todosQuery.isFetching) ||
    (canReadQualityTrend && trendQuery.isFetching);

  const errors: Array<{ key: string; message: string; onRetry?: () => void }> = [];
  if (summaryError) {
    errors.push({
      key: "summary",
      message: `儀表板統計：${formatErrorMessage(summaryError)}`,
      onRetry: () => void summaryQuery.refetch(),
    });
  }
  if (todosError) {
    errors.push({
      key: "todos",
      message: `待辦清單：${formatErrorMessage(todosError)}`,
      onRetry: () => void todosQuery.refetch(),
    });
  }
  if (trendError) {
    errors.push({
      key: "quality-trend",
      message: `品質趨勢：${formatErrorMessage(trendError)}`,
      onRetry: () => void trendQuery.refetch(),
    });
  }
  if (receiptsQuery.error) {
    errors.push({
      key: "receipts",
      message: `收料紀錄：${formatErrorMessage(receiptsQuery.error)}`,
      onRetry: () => void receiptsQuery.refetch(),
    });
  }

  const lotStatusEntries = summary?.internal_lots
    ? Object.entries(summary.internal_lots.by_lot_status)
    : [];
  const hasVisibleSummaryBlocks = Boolean(
    summary?.receipts ||
      summary?.internal_lots ||
      summary?.iqc ||
      summary?.nonconformances,
  );

  const showNoDataPanel =
    !loading &&
    !canReadReceipts &&
    (!canReadDashboardSummary || summaryForbidden || (!summaryQuery.isLoading && !hasVisibleSummaryBlocks));

  return (
    <section>
      <PageHeader
        eyebrow="品保作業"
        title="儀表板"
        description="顯示依權限可讀取的統計區塊與最近收料紀錄。"
        action={
          <button
            type="button"
            className={buttonClass}
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            重新整理
          </button>
        }
      />

      {loading && <LoadingState label="正在載入儀表板資料…" />}

      {errors.length > 0 && (
        <div className="mb-5 space-y-2">
          {errors.map((error) => (
            <ErrorState key={error.key} message={error.message} onRetry={error.onRetry} />
          ))}
        </div>
      )}

      {summaryForbidden && (
        <Panel title="無法讀取統計資料" description="目前帳號沒有儀表板統計的讀取權限。">
          <EmptyState
            title="沒有可讀取的儀表板統計"
            description="請洽系統管理員確認收料、物料、IQC 或不合格案件的讀取權限。"
          />
        </Panel>
      )}

      {!loading && !summaryForbidden && hasVisibleSummaryBlocks && (
        <div className="space-y-6 mb-6">
          {summary?.receipts && (
            <Panel title="收料統計" description="依收料紀錄彙總。">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="收料總數" value={summary.receipts.total} detail="收料紀錄總筆數" />
              </div>
            </Panel>
          )}

          {summary?.internal_lots && (
            <Panel title="內部批號統計" description="依內部物料批次彙總。">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
                <Metric
                  label="內部批號總數"
                  value={summary.internal_lots.total}
                  detail="內部批號總筆數"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 mb-2">批號狀態分布</p>
                {lotStatusEntries.length > 0 ? (
                  <DataTable>
                    <TableHead>
                      <TableRow>
                        <Th>批號狀態</Th>
                        <Th>數量</Th>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {lotStatusEntries.map(([status, count]) => (
                        <TableRow key={status}>
                          <Td>
                            <StatusBadge value={status} />
                          </Td>
                          <Td className="tabular-nums">{count}</Td>
                        </TableRow>
                      ))}
                    </TableBody>
                  </DataTable>
                ) : (
                  <EmptyState
                    title="尚無批號狀態資料"
                    description="目前沒有可統計的內部批號狀態分布。"
                  />
                )}
              </div>
            </Panel>
          )}

          {summary?.iqc && (
            <Panel title="IQC 品質統計" description="依 IQC 檢驗紀錄彙總。">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="IQC 紀錄總數" value={summary.iqc.total} detail="IQC 檢驗紀錄總筆數" />
                <Metric label="待審核" value={summary.iqc.pending_review} detail="review_status = pending" />
                <Metric label="合格" value={summary.iqc.passed} detail="inspection_result = passed" />
                <Metric label="不合格" value={summary.iqc.failed} detail="inspection_result = failed" />
              </div>
            </Panel>
          )}

          {summary?.nonconformances && (
            <Panel title="不合格案件統計" description="依不合格案件狀態彙總。">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="不合格案件總數"
                  value={summary.nonconformances.total}
                  detail="案件總筆數"
                />
                <Metric label="未結案" value={summary.nonconformances.open} detail="status 非 closed" />
                <Metric label="已結案" value={summary.nonconformances.closed} detail="status = closed" />
              </div>
            </Panel>
          )}
        </div>
      )}

      {canReadQualityTrend && !trendForbidden && (
        <Panel title="品質趨勢" description="依 IQC 檢驗日期彙總每月檢驗量與合格率。">
          {trendQuery.isLoading ? (
            <LoadingState label="正在載入品質趨勢…" />
          ) : trendError ? (
            <EmptyState title="品質趨勢讀取失敗" description="請重試品質趨勢查詢。" />
          ) : trend.length === 0 ? (
            <EmptyState
              title="尚無品質趨勢資料"
              description="在區間內沒有可統計的 IQC 檢驗紀錄。"
            />
          ) : (
            <QualityTrendChart data={trend} />
          )}
        </Panel>
      )}

      {canReadTodos && !todosForbidden && (
        <>
          {todos?.pending_iqc && todos.pending_iqc.length > 0 && (
            <Panel title="待審核 IQC 清單" description="IQC 檢驗紀錄中 review_status = pending 的項目。">
              {todosQuery.isLoading ? (
                <LoadingState label="正在載入待審核 IQC…" />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <Th>IQC ID</Th>
                      <Th>收料單號</Th>
                      <Th>內部批號</Th>
                      <Th>供應商</Th>
                      <Th>物料</Th>
                      <Th>檢驗結果</Th>
                      <Th>建立時間</Th>
                      <Th>操作</Th>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {todos.pending_iqc.map((item) => (
                      <TableRow key={item.id}>
                        <Td className="font-medium text-slate-900">{item.id}</Td>
                        <Td>{item.receipt_no ?? "—"}</Td>
                        <Td>{item.internal_lot_no ?? "—"}</Td>
                        <Td>
                          {item.supplier_name ? (
                            <span>{item.supplier_name} ({item.supplier_code})</span>
                          ) : item.supplier_code ? (
                            <span>{item.supplier_code}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </Td>
                        <Td>
                          {item.material_name ? (
                            <span>{item.material_name} ({item.material_code})</span>
                          ) : item.material_code ? (
                            <span>{item.material_code}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </Td>
                        <Td>
                          <StatusBadge value={item.inspection_result} />
                        </Td>
                        <Td>{formatTaiwanDate(item.created_at)}</Td>
                        <Td>
                          <Link
                            to={item.detail_path}
                            className="text-sm font-medium text-sky-800 hover:text-sky-950"
                          >
                            詳細
                          </Link>
                        </Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </Panel>
          )}

          {todos?.open_nc && todos.open_nc.length > 0 && (
            <Panel title="未結案不合格案件清單" description="不合格案件中 status 非 closed 的項目。">
              {todosQuery.isLoading ? (
                <LoadingState label="正在載入未結案 NC…" />
              ) : (
                <DataTable>
                  <TableHead>
                    <TableRow>
                      <Th>案件 ID</Th>
                      <Th>案件編號</Th>
                      <Th>標題</Th>
                      <Th>狀態</Th>
                      <Th>嚴重程度</Th>
                      <Th>供應商</Th>
                      <Th>物料</Th>
                      <Th>發現時間</Th>
                      <Th>操作</Th>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {todos.open_nc.map((item) => (
                      <TableRow key={item.id}>
                        <Td className="font-medium text-slate-900">{item.id}</Td>
                        <Td>{item.case_no}</Td>
                        <Td className="max-w-[300px] truncate">{item.title}</Td>
                        <Td>
                          <StatusBadge value={item.status} />
                        </Td>
                        <Td>
                          <StatusBadge value={item.severity} />
                        </Td>
                        <Td>
                          {item.supplier_name ? (
                            <span>{item.supplier_name} ({item.supplier_code})</span>
                          ) : item.supplier_code ? (
                            <span>{item.supplier_code}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </Td>
                        <Td>
                          {item.material_name ? (
                            <span>{item.material_name} ({item.material_code})</span>
                          ) : item.material_code ? (
                            <span>{item.material_code}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </Td>
                        <Td>{formatTaiwanDate(item.found_at)}</Td>
                        <Td>
                          <Link
                            to={item.detail_path}
                            className="text-sm font-medium text-sky-800 hover:text-sky-950"
                          >
                            詳細
                          </Link>
                        </Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </Panel>
          )}

          {!todosQuery.isLoading && !todos?.pending_iqc?.length && !todos?.open_nc?.length && (
            <Panel title="品保待辦" description="目前沒有待處理的待審核 IQC 或未結案不合格案件。">
              <EmptyState title="沒有待辦項目" description="所有 IQC 已審核完成，且無未結案不合格案件。" />
            </Panel>
          )}
        </>
      )}

      {showNoDataPanel && (
        <Panel title="無法讀取資料" description="目前帳號沒有可顯示的儀表板區塊或收料資料權限。">
          <EmptyState
            title="沒有可讀取的儀表板資料"
            description="請洽系統管理員確認相關讀取權限。"
          />
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]">
        {canReadReceipts && (
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
            {receiptsQuery.isLoading ? (
              <LoadingState />
            ) : receiptsQuery.data?.items.length ? (
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
                  {receiptsQuery.data.items.slice(0, 6).map((receipt) => (
                    <TableRow key={receipt.id}>
                      <Td className="font-medium text-slate-900">{receipt.receipt_no}</Td>
                      <Td>{formatTaiwanDate(receipt.received_at)}</Td>
                      <Td>{receipt.qty_remaining}</Td>
                      <Td>
                        <StatusBadge value={receipt.status} />
                      </Td>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            ) : receiptsQuery.error ? (
              <EmptyState
                title="收料資料讀取失敗"
                description="請依上方錯誤訊息重試；目前無法判斷是否有收料資料。"
              />
            ) : (
              <EmptyState title="尚無收料紀錄" description="建立收料紀錄後，資料會顯示於此。" />
            )}
          </Panel>
        )}

        <Panel title="品保待辦" description="待審核數量依 IQC 統計（review_status = pending）。">
          {summary?.iqc ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-amber-50 text-amber-700">
                  <ClipboardCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-slate-950">
                    {summary.iqc.pending_review}
                  </p>
                  <p className="text-xs text-slate-500">品保審核待處理</p>
                </div>
              </div>
              <Link to="/iqc" className="text-sm font-medium text-sky-800 hover:text-sky-950">
                查看 IQC
              </Link>
            </div>
          ) : !loading && summaryQuery.error ? (
            <EmptyState title="目前無法載入待辦" description="請重試儀表板統計查詢。" />
          ) : (
            <EmptyState
              title="沒有 IQC 統計資料"
              description="目前帳號無權限讀取 IQC 統計，或尚未取得統計資料。"
            />
          )}

          {canReadMaterials && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <PackageCheck className="h-4 w-4" />
                內部批號可於追溯作業中查詢。
              </div>
              <Link to="/internal-lots" className="mt-2 inline-block text-xs font-semibold text-sky-800">
                瀏覽內部批號
              </Link>
            </div>
          )}
        </Panel>
      </div>

      <p className="mt-5 text-xs text-slate-500">
        儀表板統計來源為後端彙總 API；未提供之指標不於前端推算。
      </p>
    </section>
  );
}
