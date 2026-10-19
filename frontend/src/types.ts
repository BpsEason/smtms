export type UserProfile = {
  id: number;
  username: string;
  email: string | null;
  is_active: boolean;
  roles: string[];
  permissions: string[];
  must_change_password?: boolean;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
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
  inspector_user_id: number | null;
  sample_qty: string;
  inspection_result: string;
  inspection_date: string | null;
  release_status: string;
  remarks: string | null;
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
    Pick<Supplier, "contact_name" | "phone" | "email" | "address" | "country">
  >;
export type MaterialCreatePayload = Pick<
  Material,
  "material_code" | "material_name" | "material_type" | "uom" | "status"
> &
  Partial<Pick<Material, "spec">>;

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
