import type { Nonconformance } from "../../types";
import type { FormEvent } from "react";

// 表單類型定義
export type CreateForm = {
  case_no: string;
  title: string;
  description: string;
  source: string;
  severity: string;
  found_at: string;
  supplier_id: string;
  material_id: string;
  receipt_id: string;
  supplier_lot_id: string;
  internal_lot_id: string;
  iqc_record_id: string;
  defect_qty: string;
  owner_user_id: string;
};

export type DispositionForm = {
  content: string;
  result: string;
  executed_at: string;
};

export type EditFields = {
  title: string;
  description: string;
  severity: string;
};

export type Filters = {
  q: string;
  status: string;
  source: string;
  supplier_id: string;
  lot_no: string;
};

// 新增案件表單子元件屬性
export type NonconformanceCreateFormProps = {
  isOpen: boolean;
  isLoading: boolean;
  createForm: CreateForm;
  onUpdateCreateForm: <K extends keyof CreateForm>(
    field: K,
    value: CreateForm[K],
  ) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
};

// 案件列表子元件屬性
export type NonconformanceListProps = {
  nonconformanceList: Nonconformance[];
  filters: Filters;
  errorMessage: string;
  onUpdateFilters: <K extends keyof Filters>(
    field: K,
    value: Filters[K],
  ) => void;
  onSelectItem: (id: number) => void;
};

// 案件詳細資料子元件屬性
export type NonconformanceDetailProps = {
  selectedItem: Nonconformance | null;
  isLoading: boolean;
  canEditSelected: boolean;
  canModify: boolean;
  editForm: EditFields;
  investigationContent: string;
  dispositionForm: DispositionForm;
  onUpdateEditForm: <K extends keyof EditFields>(
    field: K,
    value: EditFields[K],
  ) => void;
  onUpdateInvestigationContent: (content: string) => void;
  onUpdateDispositionForm: <K extends keyof DispositionForm>(
    field: K,
    value: DispositionForm[K],
  ) => void;
  onSaveInvestigation: () => void;
  onStatusTransition: (newStatus: string) => void;
  onAddDisposition: (event: FormEvent) => void;
  onUploadAttachment: (file?: File) => void;
  onDownloadAttachment: (attachmentId: number, filename: string) => void;
  onRemoveAttachment: (attachmentId: number) => void;
};
