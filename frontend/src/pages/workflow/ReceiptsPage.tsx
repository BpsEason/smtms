import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import {
  allSuppliers,
  allMaterials,
  allSupplierLots,
  getErrorMessage,
  localDateTimeNow,
} from "../../lib/data";
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
} from "../../components/ui";
import { statusLabel } from "../../lib/status";
import type {
  ReceiptForm,
  SplitForm,
  UserProfile,
  PaginatedResponse,
  Receipt,
  ReceiptTrace,
  Supplier,
  SupplierLot,
  Material,
} from "./types";
import { Pagination, Detail } from "./components/SharedComponents";

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
  const [receiptStatus, setReceiptStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptPage, setReceiptPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [trace, setTrace] = useState<ReceiptTrace | null>(null);
  const [_traceError, _setTraceError] = useState("");
  const [_selectedLot, _setSelectedLot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resourceLoading, setResourceLoading] = useState(true);
  const [resourceError, setResourceError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [splitError, setSplitError] = useState("");
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>({
    supplierId: "",
    materialId: "",
    supplierLotId: "",
    receiptNo: "",
    quantity: "",
    receivedAt: localDateTimeNow(),
    notes: "",
  });
  const [splitForm, setSplitForm] = useState<SplitForm>({ lotNo: "", quantity: "" });
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
        status: receiptStatus || undefined,
        date_from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
        date_to: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
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
  }, [receiptQuery, receiptStatus, dateFrom, dateTo, receiptPage]);

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
            _setTraceError(getErrorMessage(err));
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
      _setTraceError("");
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
      _setSelectedLot(created);
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
        description="檢視收料日期、供應商批號與 IQC 進度；收料登錄依既有供應商批號進行。"
        action={canWrite ? <button className={buttonClass} onClick={() => setShowReceiptForm((value) => !value)}>{showReceiptForm ? "關閉新增表單" : "新增收料紀錄"}</button> : undefined}
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
      <div className="space-y-5">
        {canWrite && showReceiptForm && (
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
                  </FormField>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="收料單號">
                      <input
                        className={inputClass}
                        required
                        maxLength={100}
                        value={receiptForm.receiptNo}
                        onChange={(e) => setReceiptForm({...receiptForm, receiptNo: e.target.value})}
                      />
                    </FormField>
                    <FormField label="收料數量">
                      <input
                        className={inputClass}
                        type="number"
                        required
                        min="0.0001"
                        step="0.0001"
                        value={receiptForm.quantity}
                        onChange={(e) => setReceiptForm({...receiptForm, quantity: e.target.value})}
                      />
                    </FormField>
                    <FormField label="收料日期">
                      <input
                        className={inputClass}
                        type="datetime-local"
                        required
                        value={receiptForm.receivedAt}
                        onChange={(e) => setReceiptForm({...receiptForm, receivedAt: e.target.value})}
                      />
                    </FormField>
                    <FormField label="備註">
                      <input
                        className={inputClass}
                        maxLength={500}
                        value={receiptForm.notes}
                        onChange={(e) => setReceiptForm({...receiptForm, notes: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div className="flex gap-2">
                    <ConfirmDialog
                      trigger={
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={(event) => {
                            if (!receiptFormRef.current?.reportValidity())
                              event.preventDefault();
                          }}
                        >
                          確認建立收料單
                        </button>
                      }
                      title="建立收料紀錄？"
                      description="收料單將與所選供應商、物料及供應商批號關聯，後端會進行資料驗證。"
                      confirmLabel="建立收料單"
                      onConfirm={createReceipt}
                    />
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => setShowReceiptForm(false)}
                    >
                      取消
                    </button>
                  </div>
                </form>
              </div>
            )}
          </Panel>
        )}

        <Panel title="收料列表">
          <div className="mb-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input
                className={inputClass}
                placeholder="搜尋收料單號、供應商或物料..."
                value={receiptQuery}
                onChange={(e) => setReceiptQuery(e.target.value)}
              />
            </div>
            <select
              className={inputClass}
              value={receiptStatus}
              onChange={(e) => setReceiptStatus(e.target.value)}
            >
              <option value="">全部狀態</option>
              <option value="pending">待處理</option>
              <option value="processing">處理中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
            <input
              type="date"
              className={inputClass}
              placeholder="開始日期"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <input
              type="date"
              className={inputClass}
              placeholder="結束日期"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          {loading ? (
            <LoadingState label="正在載入收料紀錄..." />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void loadReceipts()} />
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
                      className={selectedId === receipt.id ? "bg-slate-100" : ""}
                      onClick={() => setSelectedId(receipt.id)}
                    >
                      <Td className="font-medium">{receipt.receipt_no}</Td>
                      <Td>{receipt.supplier_name}</Td>
                      <Td>{receipt.material_name}</Td>
                      <Td>{receipt.qty_received}</Td>
                      <Td>
                        <StatusBadge value={receipt.status} />
                      </Td>
                      <Td>{new Date(receipt.received_at).toLocaleDateString()}</Td>
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

        {selectedReceipt && (
          <Panel title="收料詳情">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="收料單號" value={selectedReceipt.receipt_no} />
              <Detail label="供應商ID" value={String(selectedReceipt.supplier_id)} />
              <Detail label="物料ID" value={String(selectedReceipt.material_id)} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">狀態</p>
                <p className="mt-1">
                  <StatusBadge value={selectedReceipt.status} />
                </p>
              </div>
              <Detail label="收料數量" value={String(selectedReceipt.qty_received)} />
              <Detail label="剩餘數量" value={String(selectedReceipt.qty_remaining)} />
              <Detail label="收料日期" value={new Date(selectedReceipt.received_at).toLocaleString()} />
              <Detail label="備註" value={selectedReceipt.notes || "-"} />
            </div>

            {canWrite && Number(selectedReceipt.qty_remaining) > 0 && (
              <div className="mt-6 border-t border-slate-200 pt-6">
                <h4 className="text-sm font-semibold text-slate-900 mb-4">拆分內部批號</h4>
                {splitError && <ErrorState message={splitError} />}
                <form
                  ref={splitFormRef}
                  onSubmit={(e) => e.preventDefault()}
                  className="grid gap-4 sm:grid-cols-3"
                >
                  <FormField label="內部批號">
                    <input
                      className={inputClass}
                      required
                      maxLength={100}
                      value={splitForm.lotNo}
                      onChange={(e) => setSplitForm({...splitForm, lotNo: e.target.value})}
                    />
                  </FormField>
                  <FormField label="拆分數量">
                    <input
                      className={inputClass}
                      type="number"
                      required
                      min="0.0001"
                      step="0.0001"
                      max={Number(selectedReceipt.qty_remaining)}
                      value={splitForm.quantity}
                      onChange={(e) => setSplitForm({...splitForm, quantity: e.target.value})}
                    />
                  </FormField>
                  <div className="flex items-end">
                    <ConfirmDialog
                      trigger={
                        <button className={buttonClass} type="button">
                          拆分批號
                        </button>
                      }
                      title="建立內部批號？"
                      description="將從此收料單拆分出一個新的內部批號，剩餘數量將自動更新。"
                      confirmLabel="確認拆分"
                      onConfirm={splitReceipt}
                    />
                  </div>
                </form>
              </div>
            )}

            {trace && (
              <div className="mt-6 border-t border-slate-200 pt-6">
                <h4 className="text-sm font-semibold text-slate-900 mb-4">來源與品質追溯</h4>
                <div className="mb-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">供應商批號</p>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    {trace.supplier_lot.supplier_lot_no}
                  </span>
                </div>
                {trace.internal_lots && trace.internal_lots.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">已拆分內部批號</p>
                    <div className="space-y-3">
                      {trace.internal_lots.map((lot) => (
                        <div key={lot.internal_lot.id}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {lot.internal_lot.internal_lot_no} ({lot.internal_lot.qty_on_hand})
                            </span>
                            <StatusBadge
                              value={lot.internal_lot.lot_status}
                              label={statusLabel(lot.internal_lot.lot_status)}
                            />
                          </div>
                          {lot.iqc_records.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {lot.iqc_records.map((record) => (
                                <p key={record.id} className="text-xs text-slate-600">
                                  IQC-{record.id} · {statusLabel(record.release_status)}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {trace.receipt_iqc_records && trace.receipt_iqc_records.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">IQC 檢驗記錄</p>
                    {trace.receipt_iqc_records.map((record) => (
                      <p key={record.id} className="text-sm text-slate-900">
                        檢驗結果：<StatusBadge value={record.inspection_result} />
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Panel>
        )}
      </div>
    </section>
  );
}
