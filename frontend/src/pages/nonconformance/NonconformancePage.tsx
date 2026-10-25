import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import {
  buttonClass,
  ErrorState,
  PageHeader,
} from "../../components/ui";
import type { UserProfile } from "../../types";
import { NonconformanceCreateForm } from "./NonconformanceCreateForm";
import { NonconformanceList } from "./NonconformanceList";
import { NonconformanceDetail } from "./NonconformanceDetail";
import type { CreateForm, DispositionForm, EditFields, Filters } from "./types";
import {
  createBlankForm,
  createBlankDisposition,
  NUMERIC_FIELD_NAMES,
} from "./constants";

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
  const [nonconformanceList, setNonconformanceList] = useState<any[]>([]);
  // 目前選中的案件
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // === 使用者篩選條件 ===
  const [filters, setFilters] = useState<Filters>({
    q: "",
    status: "",
    source: "",
    supplier_id: "",
    lot_no: "",
  });

  // === 新增表單狀態（使用者未提交的草稿） ===
  const [createForm, setCreateForm] = useState<CreateForm>(() =>
    createBlankForm(searchParams.get("iqc_id") ?? ""),
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // === 編輯表單狀態（使用者未提交的草稿） ===
  const [editForm, setEditForm] = useState<EditFields>({
    title: "",
    description: "",
    severity: "medium",
  });
  const [investigationContent, setInvestigationContent] = useState("");

  // === 處置記錄表單狀態（使用者未提交的草稿） ===
  const [dispositionForm, setDispositionForm] = useState<DispositionForm>(() =>
    createBlankDisposition()
  );

  // === UI 狀態 ===
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ============ 衍生值（由既有狀態直接計算） ============
  const canModify = Boolean(profile?.permissions.includes("nonconformance:write"));
  
  // 選中案件是否可編輯（有寫入權限且未結案）
  const canEditSelected = Boolean(canModify && selectedItem && selectedItem.status !== "closed");
  
  // ============ API 操作方法 ============
  
  // 載入案件列表
  const loadNonconformanceList = useCallback(async () => {
    try {
      const result = await api.listNonconformances({ ...filters });
      setNonconformanceList(result.items);
      setErrorMessage("");
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "案件載入失敗");
    }
  }, [filters]);

  // 載入單一案件詳情
  const loadSelectedItem = async (id: number) => {
    try {
      const detail = await api.getNonconformance(id);
      setSelectedItem(detail);
      setInvestigationContent(detail.investigation ?? "");
      setEditForm({
        title: detail.title,
        description: detail.description,
        severity: detail.severity,
      });
      setErrorMessage("");
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "案件資料載入失敗");
    }
  };

  // 建立新案件
  const handleCreateSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const data: Record<string, unknown> = {
        ...createForm,
        found_at: new Date(createForm.found_at).toISOString(),
      };

      for (const key of NUMERIC_FIELD_NAMES) {
        data[key] = createForm[key] ? Number(createForm[key]) : null;
      }

      data.defect_qty = createForm.defect_qty ? createForm.defect_qty : null;

      const created = await api.createNonconformance(data);
      setIsCreateModalOpen(false);
      setCreateForm(createBlankForm());
      await loadNonconformanceList();
      await loadSelectedItem(created.id);
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "建立失敗");
    } finally {
      setIsLoading(false);
    }
  };

  // 儲存調查內容與編輯的基本資訊
  const handleSaveInvestigation = async () => {
    if (!selectedItem) return;
    setIsLoading(true);

    try {
      await api.updateNonconformance(selectedItem.id, {
        investigation: investigationContent,
        ...editForm,
      });
      await loadSelectedItem(selectedItem.id);
      await loadNonconformanceList();
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "更新失敗");
    } finally {
      setIsLoading(false);
    }
  };

  // 轉換案件狀態
  const handleStatusTransition = async (newStatus: string) => {
    if (!selectedItem) return;
    setIsLoading(true);

    try {
      await api.updateNonconformance(selectedItem.id, { 
        status: newStatus, 
        investigation: investigationContent 
      });
      await loadSelectedItem(selectedItem.id);
      await loadNonconformanceList();
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "狀態更新失敗");
    } finally {
      setIsLoading(false);
    }
  };

  // 新增處置記錄
  const handleAddDisposition = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedItem || !profile) return;
    setIsLoading(true);

    try {
      await api.addNonconformanceDisposition(selectedItem.id, {
        ...dispositionForm,
        owner_user_id: profile.id,
        executed_at: new Date(dispositionForm.executed_at).toISOString(),
      });

      setDispositionForm(createBlankDisposition());
      await loadSelectedItem(selectedItem.id);
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.details : "處置紀錄新增失敗");
    } finally {
      setIsLoading(false);
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
  const updateCreateForm = <K extends keyof CreateForm,>(field: K, value: CreateForm[K]) => {
    setCreateForm(prev => ({ ...prev, [field]: value }));
  };

  const updateFilters = <K extends keyof Filters,>(field: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const updateEditForm = <K extends keyof EditFields,>(field: K, value: EditFields[K]) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const updateDispositionForm = <K extends keyof DispositionForm,>(field: K, value: DispositionForm[K]) => {
    setDispositionForm(prev => ({ ...prev, [field]: value }));
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
            <button
              className={buttonClass}
              onClick={() => setIsCreateModalOpen(!isCreateModalOpen)}
            >
              新增案件
            </button>
          ) : undefined
        }
      />
      
      {errorMessage && <ErrorState message={errorMessage} onRetry={() => void loadNonconformanceList()} />}
      
      <NonconformanceCreateForm
        isOpen={isCreateModalOpen}
        isLoading={isLoading}
        createForm={createForm}
        onUpdateCreateForm={updateCreateForm}
        onSubmit={handleCreateSubmit}
        onClose={() => setIsCreateModalOpen(false)}
      />
      
      <NonconformanceList
        nonconformanceList={nonconformanceList}
        filters={filters}
        errorMessage={errorMessage}
        onUpdateFilters={updateFilters}
        onSelectItem={loadSelectedItem}
      />
      
      <NonconformanceDetail
        selectedItem={selectedItem}
        isLoading={isLoading}
        canEditSelected={canEditSelected}
        canModify={canModify}
        editForm={editForm}
        investigationContent={investigationContent}
        dispositionForm={dispositionForm}
        onUpdateEditForm={updateEditForm}
        onUpdateInvestigationContent={setInvestigationContent}
        onUpdateDispositionForm={updateDispositionForm}
        onSaveInvestigation={handleSaveInvestigation}
        onStatusTransition={handleStatusTransition}
        onAddDisposition={handleAddDisposition}
        onUploadAttachment={handleUploadAttachment}
        onDownloadAttachment={handleDownloadAttachment}
        onRemoveAttachment={handleRemoveAttachment}
      />
    </section>
  );
}