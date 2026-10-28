import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "../../api/client";
import {
  allSuppliers,
  allMaterials,
  allSupplierLots,
  getErrorMessage,
  localDateTimeNow,
} from "../../lib/data";
import { Button } from "@/components/shadcn/button";
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
} from "../../components/ui";
import { statusLabel } from "../../lib/status";
import type {
  UserProfile,
  Receipt,
  ReceiptTrace,
  Supplier,
  SupplierLot,
  Material,
} from "./types";
import { Pagination } from "./components/SharedComponents";
import { CreateReceiptDialog } from "./receipts/CreateReceiptDialog";
import { ReceiptDetailDialog } from "./receipts/ReceiptDetailDialog";
import { ReceiptFilters } from "./receipts/ReceiptFilters";

// 表單型別定義由子元件維護，此處僅聲明所需的回呼型別
type ReceiptFormData = {
  supplierId: string;
  materialId: string;
  supplierLotId: string;
  receiptNo: string;
  quantity: string;
  receivedAt: string;
  notes?: string;
};

type SplitFormData = {
  lotNo: string;
  quantity: string;
};

export function ReceiptsPage({ profile }: { profile: UserProfile | null }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierLots, setSupplierLots] = useState<SupplierLot[]>([]);
  const [showLotForm, setShowLotForm] = useState(false);
  const [lotSaving, setLotSaving] = useState(false);
  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptStatus, setReceiptStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptPage, setReceiptPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [trace, setTrace] = useState<ReceiptTrace | null>(null);
  const [resourceLoading, setResourceLoading] = useState(true);
  const [resourceError, setResourceError] = useState("");
  const [success, setSuccess] = useState("");
  const [splitError, setSplitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSplitSubmitting, setIsSplitSubmitting] = useState(false);
  const lotFormRef = useRef<HTMLFormElement>(null);

  // React Hook Form - 新增收料表單（僅保留必要的watch用於計算eligibleLots）
  const {
    reset,
    setValue,
    watch,
  } = useForm<ReceiptFormData>({
    defaultValues: {
      supplierId: "",
      materialId: "",
      supplierLotId: "",
      receiptNo: "",
      quantity: "",
      receivedAt: localDateTimeNow(),
      notes: "",
    },
  });

  // 監聽表單值變化，用於計算 eligibleLots
  const supplierId = watch("supplierId");
  const materialId = watch("materialId");
  const canWrite = Boolean(profile?.permissions.includes("receipts:write"));
  const canCreateSupplierLots = Boolean(
    profile?.permissions.some((permission) =>
      ["suppliers:write", "supplier-lots:write"].includes(permission),
    ),
  );
  const canTrace = ["receipts:read", "materials:read", "iqc:read"].every(
    (permission) => profile?.permissions.includes(permission),
  );
  const eligibleLots = useMemo(
    () =>
      supplierLots.filter(
        (lot) =>
          String(lot.supplier_id) === supplierId &&
          String(lot.material_id) === materialId,
      ),
    [supplierLots, supplierId, materialId],
  );

  // 創建防抖後的搜尋參數狀態
  const [debouncedQuery, setDebouncedQuery] = useState(receiptQuery);
  const [debouncedStatus, setDebouncedStatus] = useState(receiptStatus);
  const [debouncedDateFrom, setDebouncedDateFrom] = useState(dateFrom);
  const [debouncedDateTo, setDebouncedDateTo] = useState(dateTo);
  const [debouncedPage, setDebouncedPage] = useState(receiptPage);

  // 延遲更新搜尋參數以避免過多請求（僅搜尋框輸入時使用250ms防抖）
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setDebouncedQuery(receiptQuery);
        setDebouncedStatus(receiptStatus);
        setDebouncedDateFrom(dateFrom);
        setDebouncedDateTo(dateTo);
        setDebouncedPage(receiptPage);
      },
      receiptQuery ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [receiptQuery, receiptStatus, dateFrom, dateTo, receiptPage]);

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
      debouncedStatus,
      debouncedDateFrom,
      debouncedDateTo,
      debouncedPage,
    ],
    queryFn: async () => {
      const response = await api.listReceipts({
        keyword: debouncedQuery || undefined,
        status: debouncedStatus || undefined,
        date_from: debouncedDateFrom
          ? new Date(`${debouncedDateFrom}T00:00:00`).toISOString()
          : undefined,
        date_to: debouncedDateTo
          ? new Date(`${debouncedDateTo}T23:59:59.999`).toISOString()
          : undefined,
        page: debouncedPage,
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

  // 載入供應商、物料、批號選項
  useEffect(() => {
    let active = true;
    Promise.all([allSuppliers(), allMaterials(), allSupplierLots()])
      .then(([supplierItems, materialItems, lotItems]) => {
        if (active) {
          setSuppliers(supplierItems);
          setMaterials(materialItems);
          setSupplierLots(lotItems);
        }
      })
      .catch((err: unknown) => {
        if (active)
          setResourceError(
            `供應商、物料或供應商批號選項無法載入：${getErrorMessage(err)}。收料登錄需要 suppliers:read 與 materials:read 權限，且系統中必須已有符合條件的供應商批號。`,
          );
      })
      .finally(() => {
        if (active) setResourceLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // 載入選中的收料詳情與追溯
  useEffect(() => {
    if (selectedId === null) {
      setSelectedReceipt(null);
      setTrace(null);
      return;
    }

    let active = true;
    if (canTrace) {
      api
        .getReceiptTrace(selectedId)
        .then((result) => {
          if (active) {
            setTrace(result);
            setSelectedReceipt(result.receipt);
          }
        })
        .catch((err) => {
          if (active) {
            setTrace(null);
            setSelectedReceipt(null);
            console.error(getErrorMessage(err));
          }
        });
    } else {
      api
        .getReceipt(selectedId)
        .then((receipt) => {
          if (active) setSelectedReceipt(receipt);
        })
        .catch((err) => {
          if (active) {
            setSelectedReceipt(null);
            console.error(getErrorMessage(err));
          }
        });
    }
    return () => {
      active = false;
    };
  }, [selectedId, canTrace]);

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
      setTrace(null);
      setSelectedReceipt(created);
      setSelectedId(created.id);
      reset({
        supplierId: "",
        materialId: "",
        supplierLotId: "",
        receiptNo: "",
        quantity: "",
        receivedAt: localDateTimeNow(),
        notes: "",
      });
      await refetch();
    } catch (err) {
      console.error(getErrorMessage(err));
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const createSupplierLot = async () => {
    setSuccess("");
    if (!lotFormRef.current?.reportValidity()) return;
    const form = new FormData(lotFormRef.current);
    setLotSaving(true);
    try {
      const created = await api.createSupplierLot({
        supplier_id: Number(form.get("supplier_id")),
        material_id: Number(form.get("material_id")),
        supplier_lot_no: String(form.get("supplier_lot_no")).trim(),
        qty_received: String(form.get("qty_received")),
        manufacturing_date: form.get("manufacturing_date")
          ? new Date(
              `${String(form.get("manufacturing_date"))}T00:00:00`,
            ).toISOString()
          : undefined,
        expiry_date: form.get("expiry_date")
          ? new Date(
              `${String(form.get("expiry_date"))}T00:00:00`,
            ).toISOString()
          : undefined,
      });
      setSupplierLots((items) =>
        items.some((item) => item.id === created.id)
          ? items.map((item) => (item.id === created.id ? created : item))
          : [...items, created],
      );
      setValue("supplierId", String(created.supplier_id));
      setValue("materialId", String(created.material_id));
      setValue("supplierLotId", String(created.id));
      setSuccess(
        `供應商批號「${created.supplier_lot_no}」已建立，可繼續登錄收料。`,
      );
      setShowLotForm(false);
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
      if (canTrace) {
        const currentTrace = await api.getReceiptTrace(selectedReceipt.id);
        setTrace(currentTrace);
        setSelectedReceipt(currentTrace.receipt);
      } else {
        const current = await api.getReceipt(selectedReceipt.id);
        setSelectedReceipt(current);
      }
    } catch (err) {
      setSplitError(getErrorMessage(err));
      throw err;
    } finally {
      setIsSplitSubmitting(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setSelectedReceipt(null);
    setTrace(null);
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
            <Button variant="default" onClick={() => setShowReceiptForm(true)}>
              新增收料
            </Button>
            <CreateReceiptDialog
              open={showReceiptForm}
              onOpenChange={setShowReceiptForm}
              suppliers={suppliers}
              materials={materials}
              canCreateSupplierLots={canCreateSupplierLots}
              eligibleLots={eligibleLots}
              resourceLoading={resourceLoading}
              resourceError={resourceError}
              isSubmitting={isSubmitting}
              lotSaving={lotSaving}
              showLotForm={showLotForm}
              onShowLotFormChange={setShowLotForm}
              onSupplierIdChange={(id) => setValue("supplierId", id)}
              onMaterialIdChange={(id) => setValue("materialId", id)}
              onSupplierLotIdChange={(id) => setValue("supplierLotId", id)}
              onCreateSupplierLot={createSupplierLot}
              onSubmit={createReceipt}
              onReset={() => {
                reset({
                  supplierId: "",
                  materialId: "",
                  supplierLotId: "",
                  receiptNo: "",
                  quantity: "",
                  receivedAt: localDateTimeNow(),
                  notes: "",
                });
              }}
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