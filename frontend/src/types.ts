export type UserProfile = {
  id: number;
  username: string;
  email: string | null;
  is_active: boolean;
  roles: string[];
  permissions: string[];
  must_change_password?: boolean;
};

export type Nonconformance = {
  id: number; case_no: string; title: string; description: string; source: string;
  severity: string; status: string; found_at: string; found_by_user_id: number;
  owner_user_id: number | null; supplier_id: number | null; material_id: number | null;
  receipt_id: number | null; supplier_lot_id: number | null; internal_lot_id: number | null;
  iqc_record_id: number | null; defect_qty: string | null; investigation: string | null;
  closed_at: string | null; created_at: string; updated_at: string;
  dispositions?: { id: number; content: string; result: string; owner_user_id: number; executed_at: string }[];
  history?: { id: number; action: string; actor_user_id: number; before_data: string | null; after_data: string; created_at: string }[];
  attachments?: { id: number; original_filename: string; media_type: string; size_bytes: number; sha256: string }[];
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type AuditLog = {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  request_id: string | null;
  created_at: string;
};

export type Role = {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
  user_count: number;
  is_system: boolean;
};

export type PermissionItem = {
  id: number;
  code: string;
  name: string;
  description: string | null;
};

export type AdminUser = {
  id: number;
  username: string;
  email: string | null;
  is_active: boolean;
  roles: string[];
};

export type InternalUserCreatePayload = {
  username: string;
  password: string;
  email?: string;
  role_ids: number[];
};

export type Supplier = {
  id: number;
  supplier_code: string;
  supplier_name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  address: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierDocument = {
  id: number;
  supplier_id: number;
  doc_type: string;
  doc_code: string | null;
  doc_name: string;
  file_path: string | null;
  issued_at: string | null;
  expires_at: string | null;
  approved_by_user_id: number | null;
  status: string;
  created_at: string;
};

export type SupplierDocumentAttachment = {
  id: number;
  document_id: number;
  original_filename: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
};

export type SupplierDocumentPayload = {
  doc_type: string;
  doc_code?: string;
  doc_name: string;
  issued_at?: string;
  expires_at?: string;
  status: string;
};

export type Material = {
  id: number;
  material_code: string;
  material_name: string;
  material_type: string;
  spec: string | null;
  uom: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SupplierLot = {
  id: number;
  supplier_id: number;
  material_id: number;
  supplier_lot_no: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  qty_received: string;
  uom: string;
  qc_status: string;
  created_at: string;
};

export type SupplierLotCreatePayload = {
  supplier_id: number;
  material_id: number;
  supplier_lot_no: string;
  manufacturing_date?: string;
  expiry_date?: string;
  qty_received: string;
};

export type ReceiptTraceLot = {
  internal_lot: InternalLot;
  iqc_records: IQCRecord[];
};

export type ReceiptTrace = {
  receipt: Receipt;
  supplier: Supplier;
  material: Material;
  supplier_lot: SupplierLot;
  receipt_iqc_records: IQCRecord[];
  internal_lots: ReceiptTraceLot[];
};

export type TraceabilityIQC = {
  iqc_record: IQCRecord;
  review_history: QualityReview[];
};

export type TraceabilityLot = {
  internal_lot: InternalLot;
  iqc_records: TraceabilityIQC[];
};

export type TraceabilityReceipt = {
  receipt: Receipt;
  supplier: Supplier;
  material: Material;
  supplier_lot: SupplierLot;
  receipt_iqc_records: TraceabilityIQC[];
  internal_lots: TraceabilityLot[];
};

export type SupplierMaterialCreatePayload = {
  material_id: number;
  supplier_material_code?: string;
  is_preferred?: boolean;
};

export type Receipt = {
  id: number;
  supplier_id: number;
  material_id: number;
  supplier_lot_id: number;
  receipt_no: string;
  received_at: string;
  received_by_user_id: number | null;
  qty_received: string;
  qty_remaining: string;
  status: string;
  notes: string | null;
  created_at: string;
  supplier_code?: string;
  supplier_name?: string;
  material_code?: string;
  material_name?: string;
  material_uom?: string;
  supplier_lot_no?: string;
  supplier_lot_uom?: string;
  iqc_records?: ReceiptIQCSummary[] | null;
};

export type ReceiptIQCSummary = {
  id: number;
  inspection_result: string;
  release_status: string;
  review_status: string;
};

export type InternalLot = {
  id: number;
  material_id: number;
  supplier_lot_id: number | null;
  receipt_id: number | null;
  internal_lot_no: string;
  qty_on_hand: string;
  qty_reserved: string;
  uom: string;
  lot_status: string;
  expiry_date: string | null;
  created_at: string;
};

export type IQCRecord = {
  id: number;
  receipt_id: number | null;
  internal_lot_id: number | null;
  internal_lot_no?: string | null;
  inspector_user_id: number | null;
  sample_qty: string;
  inspection_result: string;
  inspection_date: string | null;
  release_status: string;
  remarks: string | null;
  review_status: string;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  review_decision_note: string | null;
  created_at: string;
};

export type QualityReview = {
  id: number;
  iqc_record_id: number;
  review_status: string;
  decision: string;
  reviewed_by_user_id: number | null;
  reviewed_by_username: string | null;
  decision_note: string | null;
  reason: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type ReceiptCreatePayload = {
  supplier_id: number;
  material_id: number;
  supplier_lot_id: number;
  receipt_no: string;
  qty_received: string;
  received_at: string;
  notes?: string;
};

export type SupplierCreatePayload = Pick<
  Supplier,
  "supplier_code" | "supplier_name" | "status"
> &
  Partial<
    Pick<Supplier, "tax_id" | "contact_name" | "phone" | "email" | "address" | "country">
  >;
export type SupplierUpdatePayload = Partial<
  Pick<Supplier, "supplier_code" | "supplier_name" | "contact_name" | "phone" | "email" | "status" | "address" | "country">
>;
export type MaterialCreatePayload = Pick<
  Material,
  "material_code" | "material_name" | "material_type" | "uom" | "status"
> &
  Partial<Pick<Material, "spec">>;
export type MaterialUpdatePayload = Partial<
  Pick<Material, "material_code" | "material_name" | "material_type" | "spec" | "uom" | "status">
>;

export type InternalLotCreatePayload = {
  internal_lot_no: string;
  qty: string;
  expiry_date?: string;
};

export type IQCCreatePayload = {
  receipt_id?: number;
  internal_lot_id?: number;
  sample_qty: string;
  inspection_result: "pending" | "passed" | "failed";
  inspection_date?: string;
  release_status: "hold" | "released" | "rejected";
  remarks?: string;
};

export type QualityReviewDecisionPayload = {
  decision_note?: string;
  reason?: string;
};

export type SupplierImportRowError = {
  sheet: string;
  row: number;
  field: string;
  message: string;
};

export type SupplierImportRowPreview = {
  row: number;
  supplier_code: string | null;
  supplier_name: string | null;
  tax_id: string | null;
  login_username: string | null;
  login_email: string | null;
  status: string | null;
  valid: boolean;
};

export type SupplierImportPreview = {
  sheet: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  skipped_rows: number;
  rows: SupplierImportRowPreview[];
  errors: SupplierImportRowError[];
};

export type SupplierImportCreatedAccount = {
  sheet: string;
  row: number;
  supplier_id: number;
  supplier_code: string;
  login_username: string;
  initial_password: string;
  password_generated: boolean;
};

export type SupplierImportResult = {
  status: "completed" | "rejected";
  created: number;
  failed: number;
  skipped: number;
  errors: SupplierImportRowError[];
  accounts: SupplierImportCreatedAccount[];
};
