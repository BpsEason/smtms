import type {
  InternalLot,
  IQCRecord,
  Material,
  PaginatedResponse,
  Receipt,
  ReceiptTrace,
  Supplier,
  SupplierLot,
  UserProfile,
} from "../../types";

export type {
  InternalLot,
  IQCRecord,
  Material,
  PaginatedResponse,
  Receipt,
  ReceiptTrace,
  Supplier,
  SupplierLot,
  UserProfile,
};

// 收料表單類型
export interface ReceiptForm {
  supplierId: string;
  materialId: string;
  supplierLotId: string;
  receiptNo: string;
  quantity: string;
  receivedAt: string;
  notes: string;
}

// 拆分表單類型
export interface SplitForm {
  lotNo: string;
  quantity: string;
}

// IQC 表單類型
export interface IQCForm {
  lotId: string;
  sampleQty: string;
  result: "pending" | "passed" | "failed";
  inspectionDate: string;
  remarks: string;
}

// 收料篩選條件
export interface ReceiptFilters {
  query: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}

// 內部批號篩選條件
export interface InternalLotFilters {
  query: string;
  status: string;
  page: number;
}

// IQC 篩選條件
export interface IQCFilters {
  query: string;
  result: string;
  page: number;
}
