import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../../api";
import { allInternalLots, getErrorMessage, localDateTimeNow } from "../../lib/data";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  buttonClass,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  SuccessMessage,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../../components/ui";
import { statusLabel } from "../../lib/status";
import type { InternalLot, UserProfile } from "./types";
import { Pagination } from "./components/SharedComponents";

// Zod 驗證 schema - IQC 新增表單
const iqcCreateSchema = z.object({
  lotId: z.string().min(1, "請選擇內部批號"),
  sampleQty: z.string().refine(
    (val) => {
      const num = Number(val);
      return !isNaN(num) && num > 0;
    },
    "抽樣數量必須大於0",
  ),
  result: z.union([z.literal("pending"), z.literal("passed"), z.literal("failed")]),
  inspectionDate: z.string().min(1, "檢驗日期時間為必填"),
  remarks: z.string().max(500, "備註最多500字元").optional(),
});

export type IQCFormData = z.infer<typeof iqcCreateSchema>;

export function IQCPage({ profile }: { profile: UserProfile | null }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updatedLot, setUpdatedLot] = useState<InternalLot | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<IQCFormData>({
    resolver: zodResolver(iqcCreateSchema),
    defaultValues: {
      lotId: "",
      sampleQty: "",
      result: "pending",
      inspectionDate: localDateTimeNow(),
      remarks: "",
    },
  });

  const form = watch();
  const canWrite = Boolean(profile?.permissions.includes("iqc:write"));
  const outcomeStatus =
    form.result === "passed" ? "released" : form.result === "failed" ? "rejected" : "hold";

  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const {
    data: records,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["iqc-records", debouncedQuery, resultFilter, page],
    queryFn: async () => {
      return api.listIQCRecords({
        keyword: debouncedQuery || undefined,
        result: resultFilter || undefined,
        page,
        page_size: 50,
      });
    },
    retry: 1,
    staleTime: 30 * 1000,
  });

  // 內部批號僅在可建立 IQC 時按需載入；沿用現有全量載入 helper（受既有 API 無搜尋/篩選參數限制）
  const {
    data: lots = [],
    isLoading: lotsLoading,
    error: lotsQueryError,
  } = useQuery({
    queryKey: ["internal-lots", "all"],
    queryFn: () => allInternalLots(),
    enabled: canWrite,
    staleTime: 5 * 60 * 1000,
  });

  const lotError = lotsQueryError ? getErrorMessage(lotsQueryError) : "";
  const selectedLot = lots.find((lot) => String(lot.id) === form.lotId);
  const displayError = queryError ? getErrorMessage(queryError) : error;

  const onSubmit = async (data: IQCFormData) => {
    setError("");
    setSuccess("");
    if (!selectedLot) return;
    try {
      const created = await api.createIQC({
        internal_lot_id: selectedLot.id,
        sample_qty: data.sampleQty,
        inspection_result: data.result,
        inspection_date: new Date(data.inspectionDate).toISOString(),
        release_status: outcomeStatus,
        remarks: data.remarks?.trim() || undefined,
      });
      setSuccess(
        `檢驗紀錄 ${created.id} 已建立，結果：${statusLabel(created.inspection_result)}／${statusLabel(created.release_status)}。`,
      );
      reset({
        lotId: "",
        sampleQty: "",
        result: "pending",
        inspectionDate: localDateTimeNow(),
        remarks: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["iqc-records"] });
      if (created.internal_lot_id !== null) {
        try {
          const actualLot = await api.getInternalLot(created.internal_lot_id);
          setUpdatedLot(actualLot);
          queryClient.setQueryData<InternalLot[]>(["internal-lots", "all"], (current) =>
            (current ?? []).map((lot) => (lot.id === actualLot.id ? actualLot : lot)),
          );
        } catch (err) {
          setError(`檢驗紀錄已建立，但無法更新目前批號狀態：${getErrorMessage(err)}`);
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
      throw err;
    }
  };

  return (
    <section>
      <PageHeader
        eyebrow="進料與品質追溯"
        title="進料檢驗（IQC）"
        description="針對內部批號進行檢驗紀錄，批號狀態由後端規則決定。檢驗完成需經審核流程方可進行後續操作。"
      />
      {displayError && (
        <div className="mb-4">
          <ErrorState message={displayError} onRetry={() => void refetch()} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <SuccessMessage>{success}</SuccessMessage>
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
        {canWrite && (
          <Panel
            title="新增檢驗紀錄"
            description="檢驗結果與批號狀態變更由後端驗證規則控制，異常或待驗的批號可進行複驗，通過則釋出。"
          >
            {lotsLoading ? (
              <LoadingState label="正在載入內部批號…" />
            ) : lotError ? (
              <ErrorState message={`無法載入檢驗對象：${lotError}`} />
            ) : !lots.length ? (
              <EmptyState
                title="目前沒有可檢驗的內部批號"
                description="請先於收料流程完成批號建立，再回到 IQC 檢驗。"
              />
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField
                  label="內部批號"
                  htmlFor="internal-lot-select"
                  error={errors.lotId?.message}
                  hint={
                    selectedLot
                      ? `目前後端批號狀態：${statusLabel(selectedLot.lot_status)} · 庫存 ${selectedLot.qty_on_hand} ${selectedLot.uom}`
                      : undefined
                  }
                >
                  <select
                    id="internal-lot-select"
                    className={inputClass}
                    aria-label="內部批號"
                    {...register("lotId", {
                      onChange: () => setUpdatedLot(null),
                    })}
                  >
                    <option value="">請選擇內部批號</option>
                    {lots.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.internal_lot_no} · {statusLabel(lot.lot_status)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="抽樣數量" htmlFor="sample-qty" error={errors.sampleQty?.message}>
                    <input id="sample-qty" className={inputClass} type="number" min="0.0001" step="any" {...register("sampleQty")} />
                  </FormField>
                  <FormField label="檢驗結果" htmlFor="inspection-result" error={errors.result?.message}>
                    <select id="inspection-result" className={inputClass} {...register("result")}>
                      <option value="pending">待驗</option>
                      <option value="passed">合格</option>
                      <option value="failed">不合格</option>
                    </select>
                  </FormField>
                  <FormField label="檢驗日期時間" htmlFor="inspection-date" error={errors.inspectionDate?.message}>
                    <input id="inspection-date" className={inputClass} type="datetime-local" {...register("inspectionDate")} />
                  </FormField>
                  <div className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>預期狀態</span>
                    <div className="flex h-[38px] items-center">
                      <StatusBadge value={outcomeStatus} />
                    </div>
                    <p className="text-xs font-normal text-slate-500">依檢驗結果由 API 規則實際判定。</p>
                  </div>
                </div>
                <FormField label="備註" htmlFor="remarks" error={errors.remarks?.message}>
                  <textarea id="remarks" className={`${inputClass} min-h-20 resize-y`} maxLength={500} {...register("remarks")} />
                </FormField>
                <ConfirmDialog
                  trigger={
                    <button type="button" className={buttonClass} disabled={!selectedLot}>
                      確認檢驗紀錄
                    </button>
                  }
                  title="確認建立檢驗結果？"
                  description={
                    selectedLot
                      ? `將記錄批號 ${selectedLot.internal_lot_no} 的檢驗結果為「${statusLabel(form.result)}」。後端將依驗證規則更新批號狀態（${statusLabel(form.result)} → ${statusLabel(outcomeStatus)}）。`
                      : "請先選擇內部批號。"
                  }
                  confirmLabel="建立檢驗紀錄"
                  onConfirm={handleSubmit(onSubmit)}
                />
              </form>
            )}
            {updatedLot && (
              <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
                <p className="font-medium text-sky-950">後端確認的批號狀態</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sky-900">
                  <span>{updatedLot.internal_lot_no}</span>
                  <StatusBadge value={updatedLot.lot_status} />
                </div>
              </div>
            )}
          </Panel>
        )}
        <Panel
          title="檢驗紀錄清單"
          description="依檢驗結果篩選，可對待驗項目進行後端驗證規則控制。"
        >
          <div className="mb-4 flex flex-wrap gap-3">
            <FormField label="搜尋備註">
              <input
                className={inputClass}
                aria-label="搜尋 IQC 備註"
                placeholder="輸入檢驗備註關鍵字"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </FormField>
            <FormField label="檢驗結果">
              <select
                className={inputClass}
                aria-label="依檢驗結果篩選"
                value={resultFilter}
                onChange={(event) => {
                  setResultFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部結果</option>
                <option value="pending">待驗</option>
                <option value="passed">合格</option>
                <option value="failed">不合格</option>
              </select>
            </FormField>
          </div>
          {loading ? (
            <LoadingState label="正在載入檢驗紀錄…" />
          ) : records?.items.length ? (
            <DataTable>
              <TableHead>
                <TableRow>
                  <Th>檢驗紀錄</Th>
                  <Th>檢驗對象</Th>
                  <Th>抽樣數量</Th>
                  <Th>檢驗日期</Th>
                  <Th>檢驗結果</Th>
                  <Th>預期狀態</Th>
                  {profile?.permissions.includes("nonconformance:write") && <Th>品質異常</Th>}
                </TableRow>
              </TableHead>
              <TableBody>
                {records.items.map((record) => {
                  const lot = lots.find((item) => item.id === record.internal_lot_id);
                  return (
                    <TableRow key={record.id}>
                      <Td className="font-medium text-slate-950">IQC-{record.id}</Td>
                      <Td>
                        {record.internal_lot_id
                          ? (lot?.internal_lot_no ?? `內部批號 ${record.internal_lot_id}`)
                          : record.receipt_id
                            ? `收料單 ${record.receipt_id}`
                            : "—"}
                      </Td>
                      <Td>{record.sample_qty}</Td>
                      <Td>
                        {record.inspection_date
                          ? new Date(record.inspection_date).toLocaleDateString("zh-TW")
                          : "—"}
                      </Td>
                      <Td>
                        <StatusBadge value={record.inspection_result} />
                      </Td>
                      <Td>
                        <StatusBadge value={record.release_status} />
                      </Td>
                      {profile?.permissions.includes("nonconformance:write") && (
                        <Td>
                          <Link className="text-sky-700 underline" to={`/nonconformances?iqc_id=${record.id}`}>
                            建立異常紀錄
                          </Link>
                        </Td>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>
          ) : displayError && !records ? null : (
            <EmptyState
              title="沒有符合的 IQC 紀錄"
              description={query || resultFilter ? "請調整搜尋條件。" : "建立檢驗紀錄後，可在此檢視。"}
            />
          )}
          <Pagination
            page={page}
            total={records?.total ?? 0}
            pageSize={records?.page_size ?? 50}
            onChange={(next) => {
              setPage(next);
            }}
          />
        </Panel>
      </div>
    </section>
  );
}
