import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import {
  allSuppliers,
  allMaterials,
  allSupplierLots,
  getErrorMessage,
} from "../../lib/data";
import {
  DataTable,
  EmptyState,
  ErrorState,
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
  buttonClass,
} from "../../components/ui";
import { statusLabel } from "../../lib/status";
import type { SupplierLotCreatePayload } from "../../types";
import type {
  UserProfile,
} from "./types";
import { Pagination } from "./components/SharedComponents";
import { CreateReceiptDialog } from "./receipts/CreateReceiptDialog";
import { ReceiptDetailDialog } from "./receipts/ReceiptDetailDialog";
import { ReceiptFilters } from "./receipts/ReceiptFilters";
import type { ReceiptFormData } from "./receipts/CreateReceiptDialog";

type SplitFormData = {
  lotNo: string;
  quantity: string;
};

export function ReceiptsPage({ profile }: { profile: UserProfile | null }) {
  const queryClient = useQueryClient();
  const [lotSaving, setLotSaving] = useState(false);
  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptStatus, setReceiptStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptPage, setReceiptPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [success, setSuccess] = useState("");
  const [splitError, setSplitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSplitSubmitting, setIsSplitSubmitting] = useState(false);

  const canWrite = Boolean(profile?.permissions.includes("receipts:write"));
  const canCreateSupplierLots = Boolean(
    profile?.permissions.some((permission) =>
      ["suppliers:write", "supplier-lots:write"].includes(permission),
    ),
  );
  const canTrace = ["receipts:read", "materials:read", "iqc:read"].every(
    (permission) => profile?.permissions.includes(permission),
  );
  // 主檔資料僅在開啟建檔對話框時按需載入，避免每次進入頁面觸發全量分頁請求
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", "all"],
    queryFn: () => allSuppliers(),
    enabled: showReceiptForm,
    staleTime: 5 * 60 * 1000,
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["materials", "all"],
    queryFn: () => allMaterials(),
    enabled: showReceiptForm,
    staleTime: 5 * 60 * 1000,
  });
  const { data: supplierLots = [] } = useQuery({
    queryKey: ["supplierLots", "all"],
    queryFn: () => allSupplierLots(),
    enabled: showReceiptForm,
    staleTime: 5 * 60 * 1000,
  });

  // 創建防抖後的搜尋參數狀態
  const [debouncedQuery, setDebouncedQuery] = useState(receiptQuery);

  // 僅對搜尋框輸入使用 250ms 防抖
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setDebouncedQuery(receiptQuery);
      },
      receiptQuery ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [receiptQuery]);

  // 使用 TanStack Query 管理收料紀錄資料載入
  const {
    data: receipts,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: [
      "receipts",
      debouncedQuery,
      receiptStatus,
      dateFrom,
      dateTo,
      receiptPage,
    ],
    queryFn: async () => {
      const response = await api.listReceipts({
        keyword: debouncedQuery || undefined,
        status: receiptStatus || undefined,
        date_from: dateFrom
          ? `${dateFrom}T00:00:00`
          : undefined,
        date_to: dateTo
          ? `${dateTo}T23:59:59`
          : undefined,
        page: receiptPage,
        page_size: 50,
      });
      return response;
    },
    retry: 1,
    staleTime: 30 * 1000,
  });

  // 每當 receipts 更新時，檢查當前選中的 ID 是否仍然存在，如果不存在則清除
  useEffect(() => {
    if (!receipts?.items.length) {
      setSelectedId(null);
      return;
    }
    // 如果當前選取的項目已不在列表中，則清除選取
    setSelectedId((current) =>
      current !== null && receipts.items.some((item) => item.id === current)
        ? current
        : null,
    );
  }, [receipts]);

  const error = queryError ? getErrorMessage(queryError) : "";

  // 載入選中的收料詳情與追溯
  const { data: detailData } = useQuery({
    queryKey: ["receiptDetail", selectedId, canTrace],
    queryFn: async () => {
      if (selectedId === null) return null;
      if (canTrace) {
        const result = await api.getReceiptTrace(selectedId);
        return { trace: result, receipt: result.receipt };
      }
      const receipt = await api.getReceipt(selectedId);
      return { trace: null, receipt };
    },
    enabled: selectedId !== null,
    staleTime: 30 * 1000,
  });

  const selectedReceipt = detailData?.receipt ?? null;
  const trace = detailData?.trace ?? null;

  const createReceipt = async (data: ReceiptFormData) => {
    setSuccess("");
    setIsSubmitting(true);
    try {
      const created = await api.createReceipt({
        supplier_id: Number(data.supplierId),
        material_id: Number(data.materialId),
        supplier_lot_id: Number(data.supplierLotId),
        receipt_no: data.receiptNo.trim(),
        qty_received: data.quantity,
        received_at: new Date(data.receivedAt).toISOString(),
        notes: data.notes?.trim() || undefined,
      });
      setSuccess(
        `收料單 ${created.receipt_no} 已建立，狀態：${statusLabel(created.status)}。`,
      );
      setSelectedId(created.id);
      await refetch();
    } catch (err) {
      console.error(getErrorMessage(err));
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const createSupplierLot = async (payload: SupplierLotCreatePayload) => {
    setSuccess("");
    setLotSaving(true);
    try {
      const created = await api.createSupplierLot({
        supplier_id: payload.supplier_id,
        material_id: payload.material_id,
        supplier_lot_no: payload.supplier_lot_no,
        qty_received: payload.qty_received,
        manufacturing_date: payload.manufacturing_date,
        expiry_date: payload.expiry_date,
      });
      await queryClient.invalidateQueries({ queryKey: ["supplierLots", "all"] });
      setSuccess(
        `供應商批號「${created.supplier_lot_no}」已建立，可繼續登錄收料。`,
      );
      return created;
    } catch (err) {
      console.error(getErrorMessage(err));
      throw err;
    } finally {
      setLotSaving(false);
    }
  };

  const splitReceipt = async (data: SplitFormData) => {
    setSplitError("");
    setSuccess("");
    setIsSplitSubmitting(true);
    if (!selectedReceipt) return;
    try {
      const created = await api.splitReceipt(selectedReceipt.id, {
        internal_lot_no: data.lotNo.trim(),
        qty: data.quantity,
      });
      setSuccess(
        `內部批號 ${created.internal_lot_no} 已建立。後端狀態：${statusLabel(created.lot_status)}。`,
      );
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["receiptDetail", selectedReceipt.id] });
    } catch (err) {
      setSplitError(getErrorMessage(err));
      throw err;
    } finally {
      setIsSplitSubmitting(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setSplitError("");
  };

  return (
    <section>
      <PageHeader
        eyebrow="進料管理"
        title="收料紀錄"
        description="檢視收料日期、供應商批號與 IQC 進度；收料登錄依既有供應商批號進行。"
        action={
          canWrite ? (
            <>
              <button
                type="button"
                className={buttonClass}
                onClick={() => setShowReceiptForm(true)}
              >
                新增收料
              </button>
              <CreateReceiptDialog
                open={showReceiptForm}
                onOpenChange={setShowReceiptForm}
                suppliers={suppliers}
                materials={materials}
                supplierLots={supplierLots}
                canCreateSupplierLots={canCreateSupplierLots}
                resourceLoading={
                  showReceiptForm &&
                  (suppliers.length === 0 || materials.length === 0 || supplierLots.length === 0) &&
                  lotSaving === false
                }
                isSubmitting={isSubmitting}
                lotSaving={lotSaving}
                onSubmit={createReceipt}
                onCreateSupplierLot={createSupplierLot}
              />
            </>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void refetch()} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <SuccessMessage>{success}</SuccessMessage>
        </div>
      )}

      <div className="space-y-5">
        <Panel title="收料列表">
          <ReceiptFilters
            receiptQuery={receiptQuery}
            receiptStatus={receiptStatus}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onQueryChange={setReceiptQuery}
            onStatusChange={setReceiptStatus}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />

          {loading ? (
            <LoadingState label="正在載入收料紀錄..." />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void refetch()} />
          ) : !receipts?.items.length ? (
            <EmptyState title="目前沒有收料紀錄" />
          ) : (
            <>
              <DataTable>
                <TableHead>
                  <TableRow>
                    <Th>收料單號</Th>
                    <Th>供應商</Th>
                    <Th>物料</Th>
                    <Th>數量</Th>
                    <Th>狀態</Th>
                    <Th>收料日期</Th>
                    <Th>操作</Th>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {receipts.items.map((receipt) => (
                    <TableRow
                      key={receipt.id}
                      className={
                        selectedId === receipt.id ? "bg-slate-100" : ""
                      }
                    >
                      <Td className="font-medium">{receipt.receipt_no}</Td>
                      <Td>{receipt.supplier_name}</Td>
                      <Td>{receipt.material_name}</Td>
                      <Td>{receipt.qty_received}</Td>
                      <Td>
                        <StatusBadge value={receipt.status} />
                      </Td>
                      <Td>
                        {new Date(receipt.received_at).toLocaleDateString()}
                      </Td>
                      <Td>
                        <button
                          className="text-sm text-blue-600 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(receipt.id);
                          }}
                        >
                          查看詳情
                        </button>
                      </Td>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
              <Pagination
                page={receiptPage}
                pageSize={50}
                total={receipts.total}
                onChange={setReceiptPage}
              />
            </>
          )}
        </Panel>
      </div>

      {/* 收料詳情 Dialog - 放在列表之後，使用 Portal 確保正確浮層 */}
      <ReceiptDetailDialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        selectedReceipt={selectedReceipt}
        trace={trace}
        canWrite={canWrite}
        splitError={splitError}
        isSplitSubmitting={isSplitSubmitting}
        onSplitSubmit={splitReceipt}
        onClose={closeDetail}
      />
    </section>
  );
}