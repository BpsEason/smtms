import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  ClipboardCheck,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
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
} from "../components/ui";
import type {
  InternalLot,
  IQCRecord,
  PaginatedResponse,
  Receipt,
  UserProfile,
} from "../types";

export function DashboardPage({ profile }: { profile: UserProfile | null }) {
  const [receipts, setReceipts] = useState<PaginatedResponse<Receipt> | null>(
    null,
  );
  const [lots, setLots] = useState<PaginatedResponse<InternalLot> | null>(null);
  const [iqc, setIqc] = useState<PaginatedResponse<IQCRecord> | null>(null);
  const [pending, setPending] = useState<PaginatedResponse<IQCRecord> | null>(
    null,
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const can = useCallback(
    (permission: string) => Boolean(profile?.permissions.includes(permission)),
    [profile],
  );

  const load = useCallback(async () => {
    if (!profile) return;
    const requests = [
      can("receipts:read")
        ? api
            .listReceipts({ page: 1, page_size: 8 })
            .then(setReceipts)
            .catch((error) =>
              setErrors((current) => [
                ...current,
                `收料紀錄：${formatErrorMessage(error)}`,
              ]),
            )
        : Promise.resolve(),
      can("materials:read")
        ? api
            .listInternalLots({ page: 1, page_size: 1 })
            .then(setLots)
            .catch((error) =>
              setErrors((current) => [
                ...current,
                `內部批號：${formatErrorMessage(error)}`,
              ]),
            )
        : Promise.resolve(),
      can("iqc:read")
        ? api
            .listIQCRecords({ page: 1, page_size: 1 })
            .then(setIqc)
            .catch((error) =>
              setErrors((current) => [
                ...current,
                `IQC 紀錄：${formatErrorMessage(error)}`,
              ]),
            )
        : Promise.resolve(),
      can("iqc:read")
        ? api
            .listIQCRecords({ review_status: "pending", page: 1, page_size: 1 })
            .then(setPending)
            .catch((error) =>
              setErrors((current) => [
                ...current,
                `待審核項目：${formatErrorMessage(error)}`,
              ]),
            )
        : Promise.resolve(),
    ];
    await Promise.all(requests);
    setLoading(false);
  }, [can, profile]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const metrics = [
    can("receipts:read") &&
      receipts && {
        label: "收料紀錄",
        value: receipts.total,
        detail: "收料查詢回傳的紀錄總數",
      },
    can("materials:read") &&
      lots && {
        label: "內部批號",
        value: lots.total,
        detail: "內部批號紀錄總數",
      },
    can("iqc:read") &&
      iqc && {
        label: "IQC 紀錄",
        value: iqc.total,
        detail: "進料檢驗紀錄總數",
      },
    can("iqc:read") &&
      pending && {
        label: "待審核",
        value: pending.total,
        detail: "品保審核狀態為待審核的紀錄數",
      },
  ].filter((item): item is { label: string; value: number; detail: string } =>
    Boolean(item),
  );

  return (
    <section>
      <PageHeader
        eyebrow="品保作業"
        title="儀表板"
        description="即時作業摘要。筆數依目前 API 查詢結果統計；目前尚無品質 KPI 與趨勢彙總資料。"
        action={
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setLoading(true);
              setErrors([]);
              void load();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            重新整理
          </button>
        }
      />
      {loading ? <LoadingState label="正在載入即時作業資料…" /> : null}
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
                查看收料紀錄 <ArrowUpRight className="h-3.5 w-3.5" />
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
                      <Td>
                        {new Date(receipt.received_at).toLocaleDateString(
                          "zh-TW",
                        )}
                      </Td>
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
        <Panel title="品保待辦" description="待審核數量依後端審核狀態欄位篩選。">
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
                  <p className="text-xs text-slate-500">品保審核待處理</p>
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
        儀表板統計來源為分頁 API
        回傳總數；不會依部分清單推算良率、不良率或趨勢。
      </p>
    </section>
  );
}