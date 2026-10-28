import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "../../api/client";
import { Button } from "../../components/shadcn/button";
import {
  ErrorState,
  PageHeader,
} from "../../components/ui";
import type { UserProfile, Nonconformance } from "../../types";
import { NonconformanceCreateForm } from "./NonconformanceCreateForm";
import { NonconformanceList } from "./NonconformanceList";
import { NonconformanceDetail } from "./NonconformanceDetail";
import type { Filters } from "./types";
import {
  createBlankForm,
  createBlankDisposition,
  NUMERIC_FIELD_NAMES,
  SOURCE_OPTIONS,
  SEVERITY_OPTIONS,
} from "./constants";

// 輔助函數：驗證ID欄位（必須是正整數，空字串視為未填）
const idFieldSchema = z.string().refine(
  (val) => {
    if (val === "") return true; // 空字串視為未填，通過驗證
    const num = Number(val);
    return !isNaN(num) && Number.isInteger(num) && num > 0;
  },
  "必須是有效的正整數"
);

// 輔助函數：驗證defect_qty欄位（必須是非負數，最多4位小數，空字串視為未填）
const defectQtySchema = z.string().refine(
  (val) => {
    if (val === "") return true; // 空字串視為未填，通過驗證
    const num = Number(val);
    if (isNaN(num) || num < 0) return false;
    // 檢查是否最多4位小數
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
export function NonconformancePage({
  profile,
}: {
  profile: UserProfile | null;
}) {
  const [searchParams] = useSearchParams();

  // ============ 狀態管理 - 按用途分組 ============
  
  // === 伺服器資料狀態 ===
  // 案件列表
  const [nonconformanceList, setNonconformanceList] = useState<Nonconformance[]>([]);
  // 目前選中的案件
  const [selectedItem, setSelectedItem] = useState<Nonconformance | null>(null);
  // 列表載入狀態
  const [isListLoading, setIsListLoading] = useState(false);

  // === 使用者篩選條件 ===
  const [filters, setFilters] = useState<Filters>({
    q: "",
    status: "",
    source: "",
    supplier_id: "",
    lot_no: "",
  });

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
  
  // 當模態框打開/關閉或編輯狀態改變時重設表單
  useEffect(() => {
    if (isCreateModalOpen) {
      reset({
        ...createBlankForm(searchParams.get("iqc_id") ?? ""),
      });
    }
  }, [isCreateModalOpen, reset, searchParams]);

  // === 編輯表單狀態 - 使用 react-hook-form 管理 ===
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    getValues: getEditValues,
    formState: { errors: editErrors, isSubmitting: isEditSubmitting },
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
    formState: { errors: dispositionErrors, isSubmitting: isDispositionSubmitting },
  } = useForm<DispositionFormData>({
    resolver: zodResolver(dispositionSchema),
    defaultValues: {
      ...createBlankDisposition(),
    },
  });

  // === UI 狀態 ===
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // ============ 衍生值（由既有狀態直接計算） ============
  const canModify = Boolean(profile?.permissions.includes("nonconformance:write"));
  
  // 選中案件是否可編輯（有寫入權限且未結案）
  const canEditSelected = Boolean(canModify && selectedItem && selectedItem.status !== "closed");
  
  // ============ API 操作方法 ============
  
  // 載入案件列表
  const loadNonconformanceList = useCallback(async () => {
    if (isListLoading) return;
    
    setIsListLoading(true);
    try {
      const result = await api.listNonconformances({ ...filters });
      setNonconformanceList(result.items);
      setErrorMessage("");
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "案件載入失敗");
    } finally {
      setIsListLoading(false);
    }
  }, [filters, isListLoading]);

  // 載入單一案件詳情
  const loadSelectedItem = async (id: number) => {
    try {
      const detail = await api.getNonconformance(id);
      setSelectedItem(detail);
      resetEdit({
        title: detail.title,
        description: detail.description,
        severity: detail.severity,
        investigation: detail.investigation ?? "",
      });
      setErrorMessage("");
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "案件資料載入失敗");
    }
  };

  // 建立新案件 - react-hook-form 版本
  const onSubmit = async (formData: NonconformanceCreateFormData) => {
    setErrorMessage("");

    try {
      const data: Record<string, unknown> = {
        ...formData,
        found_at: new Date(formData.found_at).toISOString(),
      };

      // 處理所有數字欄位，包括ID欄位和defect_qty
      const allNumericFields = [...NUMERIC_FIELD_NAMES, "defect_qty"];
      for (const key of allNumericFields) {
        const value = formData[key as keyof NonconformanceCreateFormData];
        data[key] = value ? Number(value) : null;
      }

      const created = await api.createNonconformance(data);
      setIsCreateModalOpen(false);
      await loadNonconformanceList();
      await loadSelectedItem(created.id);
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "建立失敗");
    }
  };

  // 儲存調查內容與編輯的基本資訊
  const handleSaveInvestigation = async (formData: NonconformanceEditFormData) => {
    if (!selectedItem) return;
    setIsSaving(true);

    try {
      await api.updateNonconformance(selectedItem.id, {
        investigation: formData.investigation,
        title: formData.title,
        description: formData.description,
        severity: formData.severity,
      });
      await loadSelectedItem(selectedItem.id);
      await loadNonconformanceList();
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "更新失敗");
    } finally {
      setIsSaving(false);
    }
  };

  // 轉換案件狀態
  const handleStatusTransition = async (newStatus: string) => {
    if (!selectedItem) return;
    
    // 從表單中獲取最新的調查內容 - 使用 getValues 方法
    const currentInvestigation = getEditValues("investigation") || "";
    
    // 結案前預檢查，提前提示使用者需要完成的項目
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
    
    setIsSaving(true);

    try {
      await api.updateNonconformance(selectedItem.id, { 
        status: newStatus, 
        investigation: currentInvestigation 
      });
      await loadSelectedItem(selectedItem.id);
      await loadNonconformanceList();
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "狀態更新失敗");
    } finally {
      setIsSaving(false);
    }
  };

  // 新增處置記錄 - react-hook-form 版本
  const onSubmitDisposition = async (formData: DispositionFormData) => {
    if (!selectedItem || !profile) return;
    setIsSaving(true);

    try {
      await api.addNonconformanceDisposition(selectedItem.id, {
        ...formData,
        owner_user_id: profile.id,
        executed_at: new Date(formData.executed_at).toISOString(),
      });

      resetDisposition({
        ...createBlankDisposition(),
      });
      await loadSelectedItem(selectedItem.id);
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "處置紀錄新增失敗");
    } finally {
      setIsSaving(false);
    }
  };

  // 上傳附件
  const handleUploadAttachment = async (file?: File) => {
    if (!selectedItem || !file) return;

    try {
      await api.uploadNonconformanceAttachment(selectedItem.id, file);
      await loadSelectedItem(selectedItem.id);
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "附件上傳失敗");
    }
  };

  // 下載附件
  const handleDownloadAttachment = async (attachmentId: number, filename: string) => {
    if (!selectedItem) return;

    try {
      const blob = await api.downloadNonconformanceAttachment(
        selectedItem.id,
        attachmentId,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "附件下載失敗");
    }
  };

  // 刪除附件
  const handleRemoveAttachment = async (attachmentId: number) => {
    if (
      !selectedItem ||
      !window.confirm("確定刪除這個案件附件？刪除動作會留下案件歷程。")
    )
      return;

    try {
      await api.deleteNonconformanceAttachment(selectedItem.id, attachmentId);
      await loadSelectedItem(selectedItem.id);
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "附件刪除失敗");
    }
  };

  // ============ 表單更新的通用處理函數 ============
  const updateFilters = <K extends keyof Filters,>(field: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };



  // ============ 生命週期 ============
  useEffect(() => {
    void loadNonconformanceList();
  }, [loadNonconformanceList]);

  // ============ 主渲染 - 頁面組成結構清晰可見 ============
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="品保作業"
        title="品質異常案件"
        description="記錄品質事件、追蹤圍堵與初步處置，並保留案件操作歷程。"
        action={
          canModify ? (
            <Button
              onClick={() => setIsCreateModalOpen(!isCreateModalOpen)}
            >
              新增案件
            </Button>
          ) : undefined
        }
      />
      
      {errorMessage && <ErrorState message={errorMessage} onRetry={() => void loadNonconformanceList()} />}
      
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
        errorMessage={errorMessage}
        isListLoading={isListLoading}
        onUpdateFilters={updateFilters}
        onSelectItem={loadSelectedItem}
      />
      
      <NonconformanceDetail
        selectedItem={selectedItem}
        isLoading={isSaving || isDispositionSubmitting || isEditSubmitting}
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
      />
    </section>
  );
}