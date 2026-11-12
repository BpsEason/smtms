import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { getIQCRecord } from "../../api/iqc";
import { formatErrorMessage } from "../../lib/error";
import {
  ErrorState,
  PageHeader,
  buttonClass,
} from "../../components/ui";
import type { UserProfile, Nonconformance, NonconformanceCreatePayload, NonconformanceUpdatePayload, NonconformanceDispositionPayload, IQCRecord } from "../../types";
import { NonconformanceCreateForm } from "./NonconformanceCreateForm";
import { NonconformanceList } from "./NonconformanceList";
import { NonconformanceDetail } from "./NonconformanceDetail";
import type { Filters } from "./types";
import {
  createBlankForm,
  createBlankDisposition,
  createFormFromIQC,
  NUMERIC_FIELD_NAMES,
  SOURCE_OPTIONS,
  SEVERITY_OPTIONS,
} from "./constants";

// 輔助函數：驗證ID欄位（必須是正整數，空字串視為未填）
const idFieldSchema = z.string().refine(
  (val) => {
    if (val === "") return true;
    const num = Number(val);
    return !isNaN(num) && Number.isInteger(num) && num > 0;
  },
  "必須是有效的正整數"
);

// 輔助函數：驗證defect_qty欄位（必須是非負數，最多4位小數，空字串視為未填）
const defectQtySchema = z.string().refine(
  (val) => {
    if (val === "") return true;
    const num = Number(val);
    if (isNaN(num) || num < 0) return false;
    const decimalParts = val.split(".");
    if (decimalParts.length > 1 && decimalParts[1].length > 4) return false;
    return true;
  },
  "必須是非負數，最多支援4位小數"
);

// Zod 驗證 schema - 新增案件
const nonconformanceCreateSchema = z.object({
  case_no: z.string().min(1, "異常編號為必填").max(80, "異常編號最多80字元"),
  title: z.string().min(1, "標題為必填").max(200, "標題最多200字元"),
  description: z.string().min(1, "異常描述為必填"),
  source: z.string().refine((val) => SOURCE_OPTIONS.some(([v]) => v === val), "請選擇有效的來源"),
  severity: z.string().refine((val) => SEVERITY_OPTIONS.some(([v]) => v === val), "請選擇有效的嚴重程度"),
  found_at: z.string().min(1, "發現時間為必填"),
  supplier_id: idFieldSchema,
  material_id: idFieldSchema,
  receipt_id: idFieldSchema,
  supplier_lot_id: idFieldSchema,
  internal_lot_id: idFieldSchema,
  iqc_record_id: idFieldSchema,
  owner_user_id: idFieldSchema,
  defect_qty: defectQtySchema,
});

export type NonconformanceCreateFormData = z.infer<typeof nonconformanceCreateSchema>;

// Zod 驗證 schema - 處置記錄
const dispositionSchema = z.object({
  content: z.string().min(1, "處置內容為必填"),
  result: z.string().min(1, "處置結果為必填"),
  executed_at: z.string().min(1, "執行時間為必填"),
});

export type DispositionFormData = z.infer<typeof dispositionSchema>;

// Zod 驗證 schema - 編輯案件基本資訊
const nonconformanceEditSchema = z.object({
  title: z.string().min(1, "標題為必填").max(200, "標題最多200字元"),
  description: z.string().min(1, "異常描述為必填"),
  severity: z.string().refine((val) => SEVERITY_OPTIONS.some(([v]) => v === val), "請選擇有效的嚴重程度"),
  investigation: z.string().optional(),
});

export type NonconformanceEditFormData = z.infer<typeof nonconformanceEditSchema>;

// ============ 主要頁面元件 ============
function NonconformancePageInner({
  profile,
}: {
  profile: UserProfile | null;
}) {
  const [searchParams] = useSearchParams();

  // === 使用者篩選條件 ===
  const [filters, setFilters] = useState<Filters>({
    q: "",
    status: "",
    source: "",
    supplier_id: "",
    lot_no: "",
  });

  // === 選中的案件 ID ===
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // === 新增表單狀態 - 使用 react-hook-form 管理 ===
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting: isLoading },
  } = useForm<NonconformanceCreateFormData>({
    resolver: zodResolver(nonconformanceCreateSchema),
    defaultValues: {
      ...createBlankForm(searchParams.get("iqc_id") ?? ""),
    },
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isAutoOpeningRef = useRef(false);

  useEffect(() => {
    if (isCreateModalOpen && !isAutoOpeningRef.current) {
      reset({
        ...createBlankForm(searchParams.get("iqc_id") ?? ""),
      });
    }
    isAutoOpeningRef.current = false;
  }, [isCreateModalOpen, reset, searchParams]);

  // === 編輯表單狀態 - 使用 react-hook-form 管理 ===
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    getValues: getEditValues,
    formState: { errors: editErrors },
  } = useForm<NonconformanceEditFormData>({
    resolver: zodResolver(nonconformanceEditSchema),
    defaultValues: {
      title: "",
      description: "",
      severity: "medium",
      investigation: "",
    },
  });

  // === 處置記錄表單狀態 - 使用 react-hook-form 管理 ===
  const {
    register: registerDisposition,
    handleSubmit: handleSubmitDisposition,
    reset: resetDisposition,
    formState: { errors: dispositionErrors },
  } = useForm<DispositionFormData>({
    resolver: zodResolver(dispositionSchema),
    defaultValues: {
      ...createBlankDisposition(),
    },
  });

  // === UI 狀態 ===
  const [errorMessage, setErrorMessage] = useState("");

  // ============ TanStack Query：遠端資料 ============

  const listQuery = useQuery<Nonconformance[]>({
    queryKey: ["nonconformances", filters],
    queryFn: async () => {
      const result = await api.listNonconformances(filters);
      return result.items;
    },
    retry: 0,
    staleTime: 30 * 1000,
  });

  const detailQuery = useQuery<Nonconformance>({
    queryKey: ["nonconformance", selectedId],
    queryFn: async () => api.getNonconformance(selectedId!),
    enabled: !!selectedId,
    retry: 1,
    staleTime: 30 * 1000,
  });

  // === IQC 資料查詢（用於從 IQC 建立異常單）===
  const iqcIdParam = searchParams.get("iqc_id");
  const iqcId = iqcIdParam ? Number(iqcIdParam) : null;
  const iqcQuery = useQuery<IQCRecord>({
    queryKey: ["iqc", iqcId],
    queryFn: async () => getIQCRecord(iqcId!),
    enabled: !!iqcId,
    retry: 0,
    staleTime: 30 * 1000,
  });

  const nonconformanceList = listQuery.data ?? [];
  const isListLoading = listQuery.isLoading;
  const selectedItem = selectedId ? detailQuery.data ?? null : null;
  const isDetailLoading = detailQuery.isLoading;

  // ============ 衍生值 ============
  const canModify = Boolean(profile?.permissions.includes("nonconformance:write"));
  const canEditSelected = Boolean(canModify && selectedId && selectedItem && selectedItem.status !== "closed");

  const queryError =
    listQuery.error ? formatErrorMessage(listQuery.error) :
    detailQuery.error ? formatErrorMessage(detailQuery.error) :
    iqcQuery.error ? formatErrorMessage(iqcQuery.error) : "";

  // === 自動從 IQC 建立異常單 ===
  const iqcHandledRef = useRef(false);

  useEffect(() => {
    const iqcIdParam = searchParams.get("iqc_id");
    const hasIqcId = !!iqcIdParam;
    const hasPermission = canModify;
    const iqcLoaded = iqcQuery.isSuccess && !!iqcQuery.data;
    const iqcError = iqcQuery.isError;

    // 已處理過、沒有 iqc_id、沒有權限、IQC 還在載入中，都不處理
    if (iqcHandledRef.current || !hasIqcId || !hasPermission || iqcQuery.isLoading) {
      return;
    }

    // IQC 載入失敗：顯示錯誤，不打開 Modal
    if (iqcError) {
      iqcHandledRef.current = true;
      setErrorMessage(`載入 IQC 檢驗資料失敗：${formatErrorMessage(iqcQuery.error)}`);
      return;
    }

    // IQC 載入成功：初始化表單並打開 Modal
    if (iqcLoaded && iqcQuery.data) {
      iqcHandledRef.current = true;
      isAutoOpeningRef.current = true;
      reset(createFormFromIQC(iqcQuery.data));
      setIsCreateModalOpen(true);
    }
  }, [searchParams, canModify, iqcQuery.isLoading, iqcQuery.isSuccess, iqcQuery.isError, iqcQuery.error, iqcQuery.data, reset, setErrorMessage]);

  // === 關閉 Modal 時重置追蹤狀態，避免 query parameter 導致重複打開 ===
  useEffect(() => {
    if (!isCreateModalOpen) {
      iqcHandledRef.current = false;
    }
  }, [isCreateModalOpen]);

  // ============ Mutations：寫入操作 ============

  const createMutation = useMutation({
    mutationFn: (payload: NonconformanceCreatePayload) => api.createNonconformance(payload),
    onSuccess: (created) => {
      void listQuery.refetch();
      setSelectedId(created.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: NonconformanceUpdatePayload }) =>
      api.updateNonconformance(id, payload),
    onSuccess: () => {
      void detailQuery.refetch();
      void listQuery.refetch();
    },
  });

  const dispositionMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: NonconformanceDispositionPayload }) =>
      api.addNonconformanceDisposition(id, payload),
    onSuccess: () => {
      void detailQuery.refetch();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) =>
      api.uploadNonconformanceAttachment(id, file),
    onSuccess: () => {
      void detailQuery.refetch();
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: ({ id, attachmentId }: { id: number; attachmentId: number }) =>
      api.deleteNonconformanceAttachment(id, attachmentId),
    onSuccess: () => {
      void detailQuery.refetch();
    },
  });

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    dispositionMutation.isPending ||
    uploadMutation.isPending ||
    deleteAttachmentMutation.isPending;

  // 當選中案件改變時，重設編輯表單
  useEffect(() => {
    if (selectedItem) {
      resetEdit({
        title: selectedItem.title,
        description: selectedItem.description,
        severity: selectedItem.severity,
        investigation: selectedItem.investigation ?? "",
      });
      setErrorMessage("");
    }
  }, [selectedItem, resetEdit]);

  // ============ API 操作方法 ============

  const clearSelectedItem = () => {
    setSelectedId(null);
    setErrorMessage("");
  };

  const updateFilters = <K extends keyof Filters>(field: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  // 建立新案件
  const onSubmit = async (formData: NonconformanceCreateFormData) => {
    setErrorMessage("");
    const data: Record<string, unknown> = {
      ...formData,
      found_at: new Date(formData.found_at).toISOString(),
    };
    const allNumericFields = [...NUMERIC_FIELD_NAMES, "defect_qty"];
    for (const key of allNumericFields) {
      const value = formData[key as keyof NonconformanceCreateFormData];
      data[key] = value ? Number(value) : null;
    }
    try {
      await createMutation.mutateAsync(data as NonconformanceCreatePayload);
      setIsCreateModalOpen(false);
    } catch (e) {
      setErrorMessage(formatErrorMessage(e));
    }
  };

  // 儲存調查內容與編輯的基本資訊
  const handleSaveInvestigation = async (formData: NonconformanceEditFormData) => {
    if (!selectedItem) return;
    setErrorMessage("");
    try {
      await updateMutation.mutateAsync({
        id: selectedItem.id,
        payload: {
          investigation: formData.investigation,
          title: formData.title,
          description: formData.description,
          severity: formData.severity,
        },
      });
    } catch (e) {
      setErrorMessage(formatErrorMessage(e));
    }
  };

  // 轉換案件狀態
  const handleStatusTransition = async (newStatus: string) => {
    if (!selectedItem) return;
    const currentInvestigation = getEditValues("investigation") || "";

    if (newStatus === "closed") {
      const hasInvestigation = currentInvestigation && currentInvestigation.trim().length > 0;
      const hasDispositions = selectedItem.dispositions && selectedItem.dispositions.length > 0;
      if (!hasInvestigation || !hasDispositions) {
        const missing = [];
        if (!hasInvestigation) missing.push("調查內容");
        if (!hasDispositions) missing.push("至少一筆處置記錄");
        setErrorMessage(`無法結案：請先完成${missing.join("和")}`);
        return;
      }
    }

    try {
      await updateMutation.mutateAsync({
        id: selectedItem.id,
        payload: { status: newStatus, investigation: currentInvestigation },
      });
    } catch (e) {
      setErrorMessage(formatErrorMessage(e));
    }
  };

  // 新增處置記錄
  const onSubmitDisposition = async (formData: DispositionFormData) => {
    if (!selectedItem || !profile) return;
    setErrorMessage("");
    try {
      await dispositionMutation.mutateAsync({
        id: selectedItem.id,
        payload: {
          ...formData,
          owner_user_id: profile.id,
          executed_at: new Date(formData.executed_at).toISOString(),
        },
      });
      resetDisposition({ ...createBlankDisposition() });
    } catch (e) {
      setErrorMessage(formatErrorMessage(e));
    }
  };

  // 上傳附件
  const handleUploadAttachment = async (file?: File) => {
    if (!selectedItem || !file) return;
    setErrorMessage("");
    try {
      await uploadMutation.mutateAsync({ id: selectedItem.id, file });
    } catch (e) {
      setErrorMessage(formatErrorMessage(e));
    }
  };

  // 下載附件
  const handleDownloadAttachment = async (attachmentId: number, filename: string) => {
    if (!selectedItem) return;
    setErrorMessage("");
    try {
      const blob = await api.downloadNonconformanceAttachment(selectedItem.id, attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorMessage(formatErrorMessage(e));
    }
  };

  // 刪除附件
  const handleRemoveAttachment = async (attachmentId: number) => {
    if (!selectedItem || !window.confirm("確定刪除這個案件附件？刪除動作會留下案件歷程。"))
      return;
    setErrorMessage("");
    try {
      await deleteAttachmentMutation.mutateAsync({ id: selectedItem.id, attachmentId });
    } catch (e) {
      setErrorMessage(formatErrorMessage(e));
    }
  };

  // ============ 主渲染 ============
  const displayError = errorMessage || queryError;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="品保作業"
        title="品質異常案件"
        description="記錄品質事件、追蹤圍堵與初步處置，並保留案件操作歷程。"
        action={
          canModify ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => setIsCreateModalOpen(!isCreateModalOpen)}
            >
              新增案件
            </button>
          ) : undefined
        }
      />

      {displayError && <ErrorState message={displayError} onRetry={() => void listQuery.refetch()} />}

      <NonconformanceCreateForm
        isOpen={isCreateModalOpen}
        isLoading={isLoading}
        register={register}
        errors={errors}
        onSubmit={handleSubmit(onSubmit)}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <NonconformanceList
        nonconformanceList={nonconformanceList}
        filters={filters}
        errorMessage={displayError}
        isListLoading={isListLoading}
        onUpdateFilters={updateFilters}
        onSelectItem={setSelectedId}
      />

      <NonconformanceDetail
        selectedItem={selectedItem}
        isLoading={isSaving || isDetailLoading}
        canEditSelected={canEditSelected}
        canModify={canModify}
        registerEdit={registerEdit}
        editErrors={editErrors}
        getEditValues={getEditValues}
        registerDisposition={registerDisposition}
        dispositionErrors={dispositionErrors}
        onSaveInvestigation={handleSubmitEdit(handleSaveInvestigation)}
        onStatusTransition={handleStatusTransition}
        onAddDisposition={handleSubmitDisposition(onSubmitDisposition)}
        onUploadAttachment={handleUploadAttachment}
        onDownloadAttachment={handleDownloadAttachment}
        onRemoveAttachment={handleRemoveAttachment}
        onClose={clearSelectedItem}
      />
    </section>
  );
}

// 匯出的包裝元件：為獨立測試與未提供 QueryClientProvider 的場景自行建立 QueryClient
export function NonconformancePage({ profile }: { profile: UserProfile | null }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <NonconformancePageInner profile={profile} />
    </QueryClientProvider>
  );
}
