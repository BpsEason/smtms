import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { api } from "../api/client";
import {
  allInternalLots,
  allMaterials,
  allSupplierLots,
  allSuppliers,
  getErrorMessage,
  localDateTimeNow,
} from "../lib/data";
import {
  buttonClass,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  secondaryButtonClass,
  StatusBadge,
  SuccessMessage,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../components/ui";
import { statusLabel } from "../lib/status";
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
} from "../types";

export function ReceiptsPage({ profile }: { profile: UserProfile | null }) {
  const [receipts, setReceipts] = useState<PaginatedResponse<Receipt> | null>(
    null,
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierLots, setSupplierLots] = useState<SupplierLot[]>([]);
  const [showLotForm, setShowLotForm] = useState(false);
  const [lotSaving, setLotSaving] = useState(false);
  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptPage, setReceiptPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [trace, setTrace] = useState<ReceiptTrace | null>(null);
  const [traceError, setTraceError] = useState("");
  const [selectedLot, setSelectedLot] = useState<InternalLot | null>(null);
  const [loading, setLoading] = useState(true);
  const [resourceLoading, setResourceLoading] = useState(true);
  const [resourceError, setResourceError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [splitError, setSplitError] = useState("");
  const [receiptForm, setReceiptForm] = useState({
    supplierId: "",
    materialId: "",
    supplierLotId: "",
    receiptNo: "",
    quantity: "",
    receivedAt: localDateTimeNow(),
    notes: "",
  });
  const [splitForm, setSplitForm] = useState({ lotNo: "", quantity: "" });
  const receiptFormRef = useRef<HTMLFormElement>(null);
  const splitFormRef = useRef<HTMLFormElement>(null);
  const lotFormRef = useRef<HTMLFormElement>(null);
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
          String(lot.supplier_id) === receiptForm.supplierId &&
          String(lot.material_id) === receiptForm.materialId,
      ),
    [supplierLots, receiptForm.supplierId, receiptForm.materialId],
  );

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.listReceipts({
        keyword: receiptQuery || undefined,
        page: receiptPage,
        page_size: 50,
      });
      setReceipts(response);
      setSelectedId((current) =>
        current !== null && response.items.some((item) => item.id === current)
          ? current
          : (response.items[0]?.id ?? null),
      );
    } catch (err) {
      setReceipts(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [receiptQuery, receiptPage]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void loadReceipts();
      },
      receiptQuery ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [loadReceipts, receiptQuery]);
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
  useEffect(() => {
    if (selectedId === null) return;
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
            setTraceError(getErrorMessage(err));
          }
        });
    } else {
      api
        .getReceipt(selectedId)
        .then((receipt) => {
          if (active) setSelectedReceipt(receipt);
        })
        .catch((err) => {
          if (active) setError(getErrorMessage(err));
        });
    }
    return () => {
      active = false;
    };
  }, [selectedId, canTrace]);

  const createReceipt = async () => {
    setError("");
    setSuccess("");
    if (!receiptFormRef.current?.reportValidity()) return;
    try {
      const created = await api.createReceipt({
        supplier_id: Number(receiptForm.supplierId),
        material_id: Number(receiptForm.materialId),
        supplier_lot_id: Number(receiptForm.supplierLotId),
        receipt_no: receiptForm.receiptNo.trim(),
        qty_received: receiptForm.quantity,
        received_at: new Date(receiptForm.receivedAt).toISOString(),
        notes: receiptForm.notes.trim() || undefined,
      });
      setSuccess(
        `收料單 ${created.receipt_no} 已建立，狀態：${statusLabel(created.status)}。`,
      );
      setTrace(null);
      setTraceError("");
      setSelectedReceipt(created);
      setSelectedId(created.id);
      setReceiptForm({
        supplierId: "",
        materialId: "",
        supplierLotId: "",
        receiptNo: "",
        quantity: "",
        receivedAt: localDateTimeNow(),
        notes: "",
      });
      await loadReceipts();
    } catch (err) {
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const createSupplierLot = async () => {
    setError("");
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
      setReceiptForm((old) => ({
        ...old,
        supplierId: String(created.supplier_id),
        materialId: String(created.material_id),
        supplierLotId: String(created.id),
      }));
      setSuccess(
        `供應商批號「${created.supplier_lot_no}」已建立，可繼續登錄收料。`,
      );
      setShowLotForm(false);
    } catch (err) {
      setError(getErrorMessage(err));
      throw err;
    } finally {
      setLotSaving(false);
    }
  };

  const splitReceipt = async () => {
    setSplitError("");
    setSuccess("");
    if (!selectedReceipt || !splitFormRef.current?.reportValidity()) return;
    if (Number(splitForm.quantity) > Number(selectedReceipt.qty_remaining)) {
      setSplitError("拆分數量不可超過收料單的剩餘數量。");
      return;
    }
    try {
      const created = await api.splitReceipt(selectedReceipt.id, {
        internal_lot_no: splitForm.lotNo.trim(),
        qty: splitForm.quantity,
      });
      setSelectedLot(created);
      setSuccess(
        `內部批號 ${created.internal_lot_no} 已建立。後端狀態：${statusLabel(created.lot_status)}。`,
      );
      setSplitForm({ lotNo: "", quantity: "" });
      await loadReceipts();
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
    }
  };

  return (
    <section>
      <PageHeader
        eyebrow="進料管理"
        title="收料紀錄"
        description="依既有供應商批號登錄收料數量，再拆分為可追溯的內部批號。"
      />
      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void loadReceipts()} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <SuccessMessage>{success}</SuccessMessage>
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
        {canWrite && (
          <Panel
            title="收料作業"
            description="依序確認供應商、物料、供應商批號，再登錄收料數量。若供應商批號尚未建檔，可先在此登錄。"
          >
            {resourceLoading ? (
              <LoadingState label="正在載入供應商與物料選項…" />
            ) : (
              <div className="space-y-4">
                {resourceError && <ErrorState message={resourceError} />}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    步驟一：登錄供應商批號
                  </h3>
                  {canCreateSupplierLots && (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={!suppliers.length || !materials.length}
                      onClick={() => setShowLotForm((open) => !open)}
                    >
                      {showLotForm ? "關閉批號登錄" : "新增供應商批號"}
                    </button>
                  )}
                </div>
                {showLotForm && canCreateSupplierLots && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <form
                      ref={lotFormRef}
                      onSubmit={(event) => event.preventDefault()}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <FormField label="供應商">
                        <select
                          className={inputClass}
                          name="supplier_id"
                          required
                          defaultValue={receiptForm.supplierId}
                        >
                          <option value="">選擇供應商</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.supplier_code} ·{" "}
                              {supplier.supplier_name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="物料">
                        <select
                          className={inputClass}
                          name="material_id"
                          required
                          defaultValue={receiptForm.materialId}
                        >
                          <option value="">選擇物料</option>
                          {materials.map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.material_code} ·{" "}
                              {material.material_name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="供應商批號（新建）">
                        <input
                          className={inputClass}
                          name="supplier_lot_no"
                          required
                          maxLength={120}
                        />
                      </FormField>
                      <FormField
                        label="批號申報數量"
                        hint="申報批號總量；收料單登錄本次實際到貨數量。"
                      >
                        <input
                          className={inputClass}
                          type="number"
                          name="qty_received"
                          min="0.0001"
                          step="0.0001"
                          required
                        />
                      </FormField>
                      <FormField label="製造日期">
                        <input
                          className={inputClass}
                          type="date"
                          name="manufacturing_date"
                        />
                      </FormField>
                      <FormField label="有效期限">
                        <input
                          className={inputClass}
                          type="date"
                          name="expiry_date"
                        />
                      </FormField>
                      <p className="text-xs text-slate-600 sm:col-span-2">
                        僅能為已建立供應商－物料關聯的組合建立批號。若關聯不存在，請先到「供應商」頁面選擇「連結物料」。
                      </p>
                      <div className="flex gap-2 sm:col-span-2">
                        <ConfirmDialog
                          trigger={
                            <button
                              type="button"
                              className={buttonClass}
                              disabled={lotSaving}
                              onClick={(event) => {
                                if (!lotFormRef.current?.reportValidity())
                                  event.preventDefault();
                              }}
                            >
                              {lotSaving ? "建立中…" : "確認批號資料"}
                            </button>
                          }
                          title="建立供應商批號？"
                          description="批號將與所選供應商及物料關聯，建立後可用於收料登錄。後端會檢查供應關係及批號唯一性。"
                          confirmLabel="建立批號"
                          onConfirm={createSupplierLot}
                        />
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          disabled={lotSaving}
                          onClick={() => setShowLotForm(false)}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                <h3 className="border-t border-slate-200 pt-4 text-sm font-semibold text-slate-900">
                  步驟二：登錄收料
                </h3>
                <form
                  ref={receiptFormRef}
                  onSubmit={(event) => event.preventDefault()}
                  className="space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="供應商">
                      <select
                        className={inputClass}
                        required
                        value={receiptForm.supplierId}
                        onChange={(event) =>
                          setReceiptForm((old) => ({
                            ...old,
                            supplierId: event.target.value,
                            supplierLotId: "",
                          }))
                        }
                      >
                        <option value="">請選擇供應商</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.supplier_code} · {supplier.supplier_name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="物料">
                      <select
                        className={inputClass}
                        required
                        value={receiptForm.materialId}
                        onChange={(event) =>
                          setReceiptForm((old) => ({
                            ...old,
                            materialId: event.target.value,
                            supplierLotId: "",
                          }))
                        }
                      >
                        <option value="">請選擇物料</option>
                        {materials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.material_code} · {material.material_name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                  <FormField
                    label="供應商批號"
                    hint="僅列出符合所選供應商與物料的批號。"
                  >
                    <select
                      className={inputClass}
                      required
                      disabled={
                        !receiptForm.supplierId || !receiptForm.materialId
                      }
                      value={receiptForm.supplierLotId}
                      onChange={(event) =>
                        setReceiptForm((old) => ({
                          ...old,
                          supplierLotId: event.target.value,
                        }))
                      }
                    >
                      <option value="">請選擇供應商批號</option>
                      {eligibleLots.map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          {lot.supplier_lot_no} · {lot.qty_received} {lot.uom} ·{" "}
                          {lot.qc_status}
                        </option>
                      ))}
                    </select>
                    {!resourceError &&
                      receiptForm.supplierId &&
                      receiptForm.materialId &&
                      eligibleLots.length === 0 && (
                        <span className="block text-xs font-normal text-amber-800">
                          找不到符合條件的批號。可先登錄供應商批號，且確認供應商已連結此物料。
                        </span>
                      )}
                  </FormField>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="收料單號">
                      <input
                        className={inputClass}
                        required
                        maxLength={80}
                        value={receiptForm.receiptNo}
                        onChange={(event) =>
                          setReceiptForm((old) => ({
                            ...old,
                            receiptNo: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="收料數量">
                      <input
                        className={inputClass}
                        type="number"
                        min="0.0001"
                        step="any"
                        required
                        value={receiptForm.quantity}
                        onChange={(event) =>
                          setReceiptForm((old) => ({
                            ...old,
                            quantity: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="收料日期時間">
                      <input
                        className={inputClass}
                        type="datetime-local"
                        required
                        value={receiptForm.receivedAt}
                        onChange={(event) =>
                          setReceiptForm((old) => ({
                            ...old,
                            receivedAt: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="備註">
                      <input
                        className={inputClass}
                        maxLength={500}
                        value={receiptForm.notes}
                        onChange={(event) =>
                          setReceiptForm((old) => ({
                            ...old,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                  </div>
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={
                          !suppliers.length ||
                          !materials.length ||
                          !eligibleLots.length ||
                          resourceLoading
                        }
                        onClick={(event) => {
                          if (!receiptFormRef.current?.reportValidity())
                            event.preventDefault();
                        }}
                      >
                        確認收料資料
                      </button>
                    }
                    title="確定建立收料紀錄？"
                    description="系統將依所選供應商批號登錄收料數量，並由後端驗證供應商、物料關聯及收料單號。"
                    confirmLabel="建立收料紀錄"
                    onConfirm={createReceipt}
                  />
                </form>
              </div>
            )}
          </Panel>
        )}
        <Panel
          title="收料清單"
          description="可依收料單號、供應商名稱或物料名稱搜尋。"
          className={!canWrite ? "xl:col-span-2" : ""}
          action={
            <button
              className={secondaryButtonClass}
              onClick={() => {
                setLoading(true);
                setError("");
                void loadReceipts();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              重新整理
            </button>
          }
        >
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className={`${inputClass} pl-9`}
              aria-label="搜尋收料紀錄"
              placeholder="搜尋收料單號、供應商或物料"
              value={receiptQuery}
              onChange={(event) => {
                setReceiptQuery(event.target.value);
                setReceiptPage(1);
                setSelectedId(null);
                setSelectedReceipt(null);
                setTrace(null);
                setTraceError("");
              }}
            />
          </div>
          {loading ? (
            <LoadingState label="正在載入收料紀錄…" />
          ) : receipts?.items.length ? (
            <div className="space-y-2">
              {receipts.items.map((receipt) => {
                const supplier = suppliers.find(
                  (item) => item.id === receipt.supplier_id,
                );
                const material = materials.find(
                  (item) => item.id === receipt.material_id,
                );
                return (
                  <button
                    key={receipt.id}
                    onClick={() => {
                      setSelectedId(receipt.id);
                      setSelectedReceipt(receipt);
                      setTrace(null);
                      setTraceError("");
                      setSelectedLot(null);
                      setSuccess("");
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left ${selectedId === receipt.id ? "border-sky-300 bg-sky-50/60" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {receipt.receipt_no}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {supplier?.supplier_name ??
                          `供應商編號 ${receipt.supplier_id}`}{" "}
                        ·{" "}
                        {material?.material_name ??
                          `物料編號 ${receipt.material_id}`}{" "}
                        ·{" "}
                        {new Date(receipt.received_at).toLocaleDateString(
                          "zh-TW",
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge value={receipt.status} />
                      <span className="text-xs tabular-nums text-slate-500">
                        剩餘 {receipt.qty_remaining}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : error && !receipts ? null : (
            <EmptyState
              title="尚無收料紀錄"
              description="請使用主檔中既有的供應商批號建立收料紀錄。"
            />
          )}
          <Pagination
            page={receiptPage}
            total={receipts?.total ?? 0}
            pageSize={receipts?.page_size ?? 50}
            onChange={(next) => {
              setLoading(true);
              setSelectedId(null);
              setSelectedReceipt(null);
              setTrace(null);
              setTraceError("");
              setReceiptPage(next);
            }}
          />
        </Panel>
      </div>
      {selectedReceipt && (
        <Panel
          title="收料明細與追溯鏈"
          description={
            canTrace
              ? "以下供應商、物料、批號與 IQC 資料由後端依資料庫關聯回傳。"
              : "目前帳號可檢視收料明細；完整追溯還需要物料及 IQC 讀取權限。"
          }
          className="mt-5"
        >
          <div className="grid gap-4 border-b border-slate-100 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="收料單號" value={selectedReceipt.receipt_no} />
            <Detail
              label="供應商／物料"
              value={`${suppliers.find((item) => item.id === selectedReceipt.supplier_id)?.supplier_name ?? `供應商編號 ${selectedReceipt.supplier_id}`}／${materials.find((item) => item.id === selectedReceipt.material_id)?.material_name ?? `物料編號 ${selectedReceipt.material_id}`}`}
            />
            <Detail
              label="收料數量／狀態"
              value={`${selectedReceipt.qty_received} · ${statusLabel(selectedReceipt.status)}`}
            />
            <Detail label="剩餘數量" value={selectedReceipt.qty_remaining} />
          </div>
          {canWrite && (
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  拆分為內部批號
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  新批號會進入待檢隔離；狀態以 API 回傳結果為準。
                </p>
              </div>
              <form
                ref={splitFormRef}
                onSubmit={(event) => event.preventDefault()}
                className="grid gap-3 sm:grid-cols-[1fr_140px_auto]"
              >
                <FormField label="內部批號">
                  <input
                    className={inputClass}
                    required
                    maxLength={120}
                    value={splitForm.lotNo}
                    onChange={(event) =>
                      setSplitForm((old) => ({
                        ...old,
                        lotNo: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField
                  label="拆分數量"
                  hint={`可拆分 ${selectedReceipt.qty_remaining}`}
                >
                  <input
                    className={inputClass}
                    type="number"
                    min="0.0001"
                    max={selectedReceipt.qty_remaining}
                    step="any"
                    required
                    value={splitForm.quantity}
                    onChange={(event) =>
                      setSplitForm((old) => ({
                        ...old,
                        quantity: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <div className="flex items-end">
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={Number(selectedReceipt.qty_remaining) <= 0}
                        onClick={(event) => {
                          if (!splitFormRef.current?.reportValidity())
                            event.preventDefault();
                        }}
                      >
                        建立批號
                      </button>
                    }
                    title="確認拆分收料數量？"
                    description={`將建立內部批號 ${splitForm.lotNo || "（未命名）"}，數量 ${splitForm.quantity || "0"}。此操作會扣減收料單剩餘數量，並將新批號設為待檢隔離。`}
                    confirmLabel="建立內部批號"
                    onConfirm={splitReceipt}
                  />
                </div>
                {splitError && (
                  <div className="sm:col-span-3">
                    <ErrorState message={splitError} />
                  </div>
                )}
              </form>
            </div>
          )}
          {canTrace && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold text-slate-900">
                來源與品質追溯
              </h3>
              {traceError ? (
                <div className="mt-3">
                  <ErrorState message={`追溯資料無法載入：${traceError}`} />
                </div>
              ) : !trace ? (
                <LoadingState label="正在載入完整追溯關聯…" />
              ) : (
                <div className="mt-3 space-y-4">
                  <div className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Detail
                      label="供應商"
                      value={`${trace.supplier.supplier_code} · ${trace.supplier.supplier_name}`}
                    />
                    <Detail
                      label="物料"
                      value={`${trace.material.material_code} · ${trace.material.material_name}`}
                    />
                    <Detail
                      label="供應商批號"
                      value={trace.supplier_lot.supplier_lot_no}
                    />
                    <Detail
                      label="批號申報數量"
                      value={`${trace.supplier_lot.qty_received} ${trace.supplier_lot.uom}`}
                    />
                  </div>
                  {trace.internal_lots.length ? (
                    <DataTable>
                      <TableHead>
                        <TableRow>
                          <Th>內部批號</Th>
                          <Th>批號數量</Th>
                          <Th>批號狀態</Th>
                          <Th>IQC 檢驗紀錄</Th>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {trace.internal_lots.map(
                          ({ internal_lot: lot, iqc_records: checks }) => (
                            <TableRow key={lot.id}>
                              <Td className="font-medium text-slate-950">
                                {lot.internal_lot_no}
                              </Td>
                              <Td>
                                {lot.qty_on_hand} {lot.uom}
                              </Td>
                              <Td>
                                <StatusBadge value={lot.lot_status} />
                              </Td>
                              <Td>
                                {checks.length ? (
                                  <div className="space-y-1">
                                    {checks.map((check) => (
                                      <p key={check.id}>
                                        IQC-{check.id} ·{" "}
                                        <StatusBadge
                                          value={check.inspection_result}
                                        />{" "}
                                        <StatusBadge
                                          value={check.release_status}
                                        />
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  "尚無 IQC 紀錄"
                                )}
                              </Td>
                            </TableRow>
                          ),
                        )}
                      </TableBody>
                    </DataTable>
                  ) : (
                    <EmptyState
                      title="此收料單尚未拆分內部批號"
                      description="建立一筆或多筆內部批號後，會顯示於追溯鏈中。"
                    />
                  )}
                  {trace.receipt_iqc_records.length > 0 && (
                    <div className="text-sm text-slate-700">
                      收料層級 IQC：
                      {trace.receipt_iqc_records
                        .map(
                          (check) =>
                            `IQC-${check.id} ${statusLabel(check.inspection_result)}／${statusLabel(check.release_status)}`,
                        )
                        .join("、")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {selectedLot && (
            <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">
                最新建立批號：{selectedLot.internal_lot_no}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-emerald-900">
                <span>批號編號：{selectedLot.id}</span>
                <span>
                  數量：{selectedLot.qty_on_hand} {selectedLot.uom}
                </span>
                <span>
                  後端狀態：
                  <StatusBadge value={selectedLot.lot_status} />
                </span>
              </div>
              <p className="mt-2 text-xs text-emerald-800">
                請前往進料檢驗（IQC）頁面為此批號建立檢驗紀錄。
              </p>
            </div>
          )}
        </Panel>
      )}
    </section>
  );
}

export function InternalLotsPage() {
  const [data, setData] = useState<PaginatedResponse<InternalLot> | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      setData(
        await api.listInternalLots({
          keyword: query || undefined,
          status: status || undefined,
          page,
          page_size: 20,
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [query, status, page]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);
  useEffect(() => {
    let active = true;
    allMaterials()
      .then((items) => {
        if (active) setMaterials(items);
      })
      .catch(() => {
        /* Keep the lot list usable when optional name enrichment is unavailable. */
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <PageHeader
        eyebrow="批號追溯"
        title="內部批號"
        description="查詢庫存批號、來源紀錄及後端控管的目前狀態。"
      />
      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      )}
      <Panel
        title="內部批號清單"
        description={`共 ${data?.total ?? "—"} 筆 · 可依批號或物料名稱搜尋並依批號狀態篩選`}
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className={`${inputClass} pl-9`}
                aria-label="搜尋內部批號"
                placeholder="搜尋批號或物料名稱"
                value={query}
                onChange={(event) => {
                  setLoading(true);
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <FormField label="批號狀態">
            <select
              className={inputClass}
              aria-label="依批號狀態篩選"
              value={status}
              onChange={(event) => {
                setLoading(true);
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部狀態</option>
              <option value="quarantine">待檢隔離</option>
              <option value="available">可用（檢驗合格）</option>
              <option value="rejected">判退</option>
            </select>
          </FormField>
        </div>
        {loading ? (
          <LoadingState label="正在載入內部批號…" />
        ) : data?.items.length ? (
          <DataTable>
            <TableHead>
              <TableRow>
                <Th>內部批號</Th>
                <Th>物料</Th>
                <Th>收料單編號</Th>
                <Th>現有數量</Th>
                <Th>預留數量</Th>
                <Th>有效期限</Th>
                <Th>批號狀態</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((lot) => (
                <TableRow key={lot.id}>
                  <Td className="font-medium text-slate-950">
                    {lot.internal_lot_no}
                  </Td>
                  <Td>
                    {materials.find(
                      (material) => material.id === lot.material_id,
                    )?.material_name ?? `物料編號 ${lot.material_id}`}
                  </Td>
                  <Td>{lot.receipt_id ?? "—"}</Td>
                  <Td>
                    {lot.qty_on_hand} {lot.uom}
                  </Td>
                  <Td>{lot.qty_reserved}</Td>
                  <Td>
                    {lot.expiry_date
                      ? new Date(lot.expiry_date).toLocaleDateString("zh-TW")
                      : "—"}
                  </Td>
                  <Td>
                    <StatusBadge value={lot.lot_status} />
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        ) : error && !data ? null : (
          <EmptyState
            title="查無內部批號"
            description="收料數量拆分為內部批號後，資料會顯示於此。"
          />
        )}
        <Pagination
          page={page}
          total={data?.total ?? 0}
          pageSize={data?.page_size ?? 20}
          onChange={(nextPage) => {
            setLoading(true);
            setPage(nextPage);
          }}
        />
      </Panel>
    </section>
  );
}

export function IQCPage({ profile }: { profile: UserProfile | null }) {
  const [records, setRecords] = useState<PaginatedResponse<IQCRecord> | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [page, setPage] = useState(1);
  const [lots, setLots] = useState<InternalLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [error, setError] = useState("");
  const [lotError, setLotError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    lotId: "",
    sampleQty: "",
    result: "pending" as "pending" | "passed" | "failed",
    inspectionDate: localDateTimeNow(),
    remarks: "",
  });
  const [updatedLot, setUpdatedLot] = useState<InternalLot | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const canWrite = Boolean(profile?.permissions.includes("iqc:write"));
  const outcomeStatus =
    form.result === "passed"
      ? "released"
      : form.result === "failed"
        ? "rejected"
        : "hold";
  const selectedLot = lots.find((lot) => String(lot.id) === form.lotId);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(
        await api.listIQCRecords({
          keyword: query || undefined,
          result: resultFilter || undefined,
          page,
          page_size: 50,
        }),
      );
      setError("");
    } catch (err) {
      setRecords(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [query, resultFilter, page]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void loadRecords();
      },
      query ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [loadRecords, query]);
  useEffect(() => {
    let active = true;
    allInternalLots()
      .then((items) => {
        if (active) setLots(items);
      })
      .catch((err) => {
        if (active) setLotError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const createInspection = async () => {
    setError("");
    setSuccess("");
    if (!formRef.current?.reportValidity() || !selectedLot) return;
    try {
      const created = await api.createIQC({
        internal_lot_id: selectedLot.id,
        sample_qty: form.sampleQty,
        inspection_result: form.result,
        inspection_date: new Date(form.inspectionDate).toISOString(),
        release_status: outcomeStatus,
        remarks: form.remarks.trim() || undefined,
      });
      setSuccess(
        `檢驗紀錄 ${created.id} 已建立，結果：${statusLabel(created.inspection_result)}／${statusLabel(created.release_status)}。`,
      );
      setForm({
        lotId: "",
        sampleQty: "",
        result: "pending",
        inspectionDate: localDateTimeNow(),
        remarks: "",
      });
      await loadRecords();
      if (created.internal_lot_id !== null) {
        try {
          const actualLot = await api.getInternalLot(created.internal_lot_id);
          setUpdatedLot(actualLot);
          setLots((current) =>
            current.map((lot) => (lot.id === actualLot.id ? actualLot : lot)),
          );
        } catch (err) {
          setError(
            `檢驗紀錄已儲存，但無法重新讀取批號狀態：${getErrorMessage(err)}`,
          );
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
      throw err;
    }
  };

  return (
    <section>
      <PageHeader
        eyebrow="進料品質管制"
        title="進料檢驗（IQC）"
        description="針對既有內部批號記錄檢驗結果；批號狀態由後端依驗證通過的檢驗結果與放行狀態更新。"
      />
      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void loadRecords()} />
        </div>
      )}
      {success && (
        <div className="mb-4">
          <SuccessMessage>{success}</SuccessMessage>
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
        {canWrite && (
          <Panel
            title="新增檢驗紀錄"
            description="檢驗結果與放行狀態依後端驗證規則配對：待檢／暫緩放行、合格／已放行、不合格／判退。"
          >
            {lotsLoading ? (
              <LoadingState label="正在載入內部批號…" />
            ) : lotError ? (
              <ErrorState message={`無法載入檢驗對象：${lotError}`} />
            ) : !lots.length ? (
              <EmptyState
                title="目前沒有可檢驗的內部批號"
                description="請先從收料紀錄建立內部批號，再進行 IQC 檢驗。"
              />
            ) : (
              <form
                ref={formRef}
                onSubmit={(event) => event.preventDefault()}
                className="space-y-4"
              >
                <FormField
                  label="內部批號"
                  hint={
                    selectedLot
                      ? `目前後端批號狀態：${statusLabel(selectedLot.lot_status)} · 庫存 ${selectedLot.qty_on_hand} ${selectedLot.uom}`
                      : undefined
                  }
                >
                  <select
                    className={inputClass}
                    required
                    value={form.lotId}
                    onChange={(event) => {
                      setForm((old) => ({ ...old, lotId: event.target.value }));
                      setUpdatedLot(null);
                    }}
                  >
                    <option value="">請選擇內部批號</option>
                    {lots.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.internal_lot_no} · {statusLabel(lot.lot_status)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="抽樣數量">
                    <input
                      className={inputClass}
                      type="number"
                      min="0.0001"
                      step="any"
                      required
                      value={form.sampleQty}
                      onChange={(event) =>
                        setForm((old) => ({
                          ...old,
                          sampleQty: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="檢驗結果">
                    <select
                      className={inputClass}
                      value={form.result}
                      onChange={(event) =>
                        setForm((old) => ({
                          ...old,
                          result: event.target.value as typeof old.result,
                        }))
                      }
                    >
                      <option value="pending">待檢</option>
                      <option value="passed">合格</option>
                      <option value="failed">不合格</option>
                    </select>
                  </FormField>
                  <FormField label="檢驗日期時間">
                    <input
                      className={inputClass}
                      type="datetime-local"
                      required
                      value={form.inspectionDate}
                      onChange={(event) =>
                        setForm((old) => ({
                          ...old,
                          inspectionDate: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                  <div className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>放行狀態</span>
                    <div className="flex h-[38px] items-center">
                      <StatusBadge value={outcomeStatus} />
                    </div>
                    <p className="text-xs font-normal text-slate-500">
                      依檢驗結果及 API 規則自動對應。
                    </p>
                  </div>
                </div>
                <FormField label="備註">
                  <textarea
                    className={`${inputClass} min-h-20 resize-y`}
                    maxLength={500}
                    value={form.remarks}
                    onChange={(event) =>
                      setForm((old) => ({
                        ...old,
                        remarks: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!selectedLot}
                      onClick={(event) => {
                        if (!formRef.current?.reportValidity())
                          event.preventDefault();
                      }}
                    >
                      確認檢驗資料
                    </button>
                  }
                  title="確定儲存檢驗結果？"
                  description={
                    selectedLot
                      ? `將記錄批號 ${selectedLot.internal_lot_no} 的檢驗結果為「${statusLabel(form.result)}」。後端將依驗證規則更新批號狀態（${statusLabel(form.result)} → ${statusLabel(outcomeStatus)}）。`
                      : "請先選擇內部批號。"
                  }
                  confirmLabel="儲存檢驗紀錄"
                  onConfirm={createInspection}
                />
              </form>
            )}
            {updatedLot && (
              <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
                <p className="font-medium text-sky-950">後端確認的批號狀態</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sky-900">
                  <span>{updatedLot.internal_lot_no}</span>
                  <StatusBadge value={updatedLot.lot_status} />
                </div>
              </div>
            )}
          </Panel>
        )}
        <Panel
          title="檢驗紀錄清單"
          description="依檢驗備註或結果篩選；結果與放行狀態由後端驗證規則維護。"
        >
          <div className="mb-4 flex flex-wrap gap-3">
            <FormField label="搜尋備註">
              <input
                className={inputClass}
                aria-label="搜尋 IQC 備註"
                placeholder="輸入檢驗備註關鍵字"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </FormField>
            <FormField label="檢驗結果">
              <select
                className={inputClass}
                aria-label="依檢驗結果篩選"
                value={resultFilter}
                onChange={(event) => {
                  setResultFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部結果</option>
                <option value="pending">待檢</option>
                <option value="passed">合格</option>
                <option value="failed">不合格</option>
              </select>
            </FormField>
          </div>
          {loading ? (
            <LoadingState label="正在載入檢驗紀錄…" />
          ) : records?.items.length ? (
            <DataTable>
              <TableHead>
                <TableRow>
                  <Th>檢驗紀錄</Th>
                  <Th>檢驗對象</Th>
                  <Th>抽樣數量</Th>
                  <Th>檢驗日期</Th>
                  <Th>檢驗結果</Th>
                  <Th>放行狀態</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.items.map((record) => {
                  const lot = lots.find(
                    (item) => item.id === record.internal_lot_id,
                  );
                  return (
                    <TableRow key={record.id}>
                      <Td className="font-medium text-slate-950">
                        IQC-{record.id}
                      </Td>
                      <Td>
                        {record.internal_lot_id
                          ? (lot?.internal_lot_no ??
                            `內部批號 ${record.internal_lot_id}`)
                          : record.receipt_id
                            ? `收料單 ${record.receipt_id}`
                            : "—"}
                      </Td>
                      <Td>{record.sample_qty}</Td>
                      <Td>
                        {record.inspection_date
                          ? new Date(record.inspection_date).toLocaleDateString(
                              "zh-TW",
                            )
                          : "—"}
                      </Td>
                      <Td>
                        <StatusBadge value={record.inspection_result} />
                      </Td>
                      <Td>
                        <StatusBadge value={record.release_status} />
                      </Td>
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>
          ) : error && !records ? null : (
            <EmptyState
              title="找不到符合的 IQC 紀錄"
              description={
                query || resultFilter
                  ? "請調整搜尋條件。"
                  : "建立檢驗紀錄後，資料會顯示於此。"
              }
            />
          )}
          <Pagination
            page={page}
            total={records?.total ?? 0}
            pageSize={records?.page_size ?? 50}
            onChange={(next) => {
              setLoading(true);
              setPage(next);
            }}
          />
        </Panel>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (value: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
      <span>
        {total
          ? `第 ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} 筆，共 ${total} 筆`
          : "共 0 筆資料"}
      </span>
      <div className="flex gap-2">
        <button
          className={secondaryButtonClass}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          上一頁
        </button>
        <button
          className={secondaryButtonClass}
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          下一頁
        </button>
      </div>
    </div>
  );
}
