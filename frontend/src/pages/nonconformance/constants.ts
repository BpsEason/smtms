import type { CreateForm, DispositionForm } from "./types";

const nowLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

// 來源選項
export const SOURCE_OPTIONS = [
  ["iqc", "IQC檢驗"],
  ["supplier", "供應商材料"],
  ["production", "生產製程"],
  ["traceability", "追溯調查"],
  ["other", "其他"],
] as const;

// 嚴重程度選項
export const SEVERITY_OPTIONS = [
  ["low", "低"],
  ["medium", "中"],
  ["high", "高"],
  ["critical", "重大"],
] as const;

// 狀態選項
export const STATUS_OPTIONS = [
  ["open", "待處理"],
  ["investigating", "調查及處置中"],
  ["pending_confirmation", "待確認"],
  ["closed", "已結案"],
] as const;

// 需要轉換為數字的欄位列表
export const NUMERIC_FIELD_NAMES = [
  "supplier_id",
  "material_id",
  "receipt_id",
  "supplier_lot_id",
  "internal_lot_id",
  "iqc_record_id",
  "owner_user_id",
] as const;

// 建立空白的新增表單資料
export const createBlankForm = (iqcId = ""): CreateForm => ({
  case_no: "",
  title: "",
  description: "",
  source: "iqc",
  severity: "medium",
  found_at: nowLocal(),
  supplier_id: "",
  material_id: "",
  receipt_id: "",
  supplier_lot_id: "",
  internal_lot_id: "",
  iqc_record_id: iqcId,
  defect_qty: "",
  owner_user_id: "",
});

// 建立空白的處置記錄表單
export const createBlankDisposition = (): DispositionForm => ({
  content: "",
  result: "",
  executed_at: nowLocal(),
});
