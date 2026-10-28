import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../api/client";
import { formatErrorMessage } from "../lib/error";
import { allMaterials, getErrorMessage } from "../lib/data";
import { Button } from "@/components/shadcn/button";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  Metric,
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
import { MaterialsPage as NewMaterialsPage } from "./materials/MaterialsPage";
import { SupplierFormDialog, type SupplierFormData } from "./suppliers/SupplierFormDialog";
import type {
  Material,
  Supplier,
  SupplierImportPreview,
  SupplierImportResult,
  SupplierDocument,
  SupplierDocumentAttachment,
  UserProfile,
} from "../types";

const supplierDocumentSchema = z.object({
  doc_type: z.string().min(1, "文件類型為必填").max(50, "文件類型最多50字元"),
  doc_name: z.string().min(1, "文件名稱為必填").max(200, "文件名稱最多200字元"),
  doc_code: z.string().max(80, "文件編號最多80字元").optional(),
  status: z.string().min(1, "狀態為必填").max(20, "狀態最多20字元"),
  issued_at: z.string().optional(),
  expires_at: z.string().optional(),
});

type SupplierDocumentFormData = z.infer<typeof supplierDocumentSchema>;

export function CatalogPages({
  kind,
  profile,
}: {
  kind: "suppliers" | "materials";
  profile: UserProfile | null;
}) {
  return kind === "suppliers" ? (
    <SuppliersPage profile={profile} />
  ) : (
    <NewMaterialsPage profile={profile} />
  );
}

function SuppliersPage({ profile }: { profile: UserProfile | null }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [linkingSupplier, setLinkingSupplier] = useState<Supplier | null>(null);
  const [documentSupplier, setDocumentSupplier] = useState<Supplier | null>(null);
  const [materialOptions, setMaterialOptions] = useState<Material[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const canWrite = Boolean(profile?.permissions.includes("suppliers:write"));

  // 僅對搜尋輸入應用防抖，分頁和篩選器立即生效
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  // 使用 TanStack Query 管理供應商列表資料載入
  const {
    data,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['suppliers', debouncedQuery, status, page],
    queryFn: async () => {
      const response = await api.listSuppliers({
        keyword: debouncedQuery || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      });
      return response;
    },
    retry: 1,
    staleTime: 30 * 1000, // 30秒內不重複請求
  });

  const displayError = queryError ? getErrorMessage(queryError) : error;

  useEffect(() => {
    if (!linkingSupplier) return;
    let active = true;
    allMaterials().then((items) => { if (active) setMaterialOptions(items) }).catch((err: unknown) => { if (active) setError(`操作失敗：${formatErrorMessage(err)}`) });
    return () => { active = false };
  }, [linkingSupplier]);
  const onSubmit = async (formData: SupplierFormData) => {
    setError("");
    setSuccess("");
    setIsSubmitting(true);
    try {
      const payload = {
        supplier_code: formData.supplier_code.trim(),
        supplier_name: formData.supplier_name.trim(),
        contact_name: optional(formData.contact_name),
        email: optional(formData.email),
        phone: optional(formData.phone),
        country: optional(formData.country),
        address: optional(formData.address),
        status: formData.status,
      };
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, payload);
        setSuccess(`供應商「${payload.supplier_name}」資料已更新。`);
      } else {
        await api.createSupplier({ ...payload, tax_id: optional(formData.tax_id) });
        setSuccess("供應商已建立。");
      }
      setDialogOpen(false);
      setEditingSupplier(null);
      setPage(1);
      // 使所有相關查詢快取失效，確保列表資料最新
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    } catch (err) {
      setError(`操作失敗：${getErrorMessage(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  const openCreateDialog = () => {
    setEditingSupplier(null);
    setError("");
    setDialogOpen(true);
  };
  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowImport(false);
    setLinkingSupplier(null);
    setError("");
    setDialogOpen(true);
  };
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingSupplier(null);
    }
  };
  const linkMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!linkingSupplier) return;
    setError(""); setSuccess(""); setLinkBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api.createSupplierMaterial(linkingSupplier.id, {
        material_id: Number(form.get("material_id")),
        supplier_material_code: optional(form.get("supplier_material_code")),
        is_preferred: form.get("is_preferred") === "on",
      });
      setSuccess(`已建立「${linkingSupplier.supplier_name}」與所選物料的供應關聯。`);
      setLinkingSupplier(null);
      // 使所有相關查詢快取失效，確保列表資料最新
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    } catch (err) { setError(`操作失敗：${formatErrorMessage(err)}`); }
    finally { setLinkBusy(false); }
  };
  return (
    <section>
      <PageHeader
        eyebrow="主檔管理"
        title="供應商管理"
        description="查詢供應商基本資料與目前資格狀態。"
        action={
          canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowImport((value) => !value);
                  setSuccess("");
                }}
              >
                <Upload className="h-4 w-4" />
                {showImport ? "關閉匯入" : "批次匯入"}
              </Button>
              <Button
                variant="default"
                onClick={openCreateDialog}
              >
                <Plus className="h-4 w-4" />
                新增供應商
              </Button>
            </div>
          )
        }
      />
      {showImport && canWrite && (
        <SupplierImportPanel
          onImported={() => {
            setPage(1);
            void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          }}
        />
      )}
      {linkingSupplier && <Panel title={`建立供應物料關聯：${linkingSupplier.supplier_name}`} description="收料與供應商批號登錄只允許使用已建立關聯的供應商與物料。" className="mb-5"><form onSubmit={linkMaterial} className="grid gap-4 sm:grid-cols-2"><FormField label="物料"><select name="material_id" className={inputClass} required defaultValue=""><option value="">選擇物料</option>{materialOptions.map((material) => <option key={material.id} value={material.id}>{material.material_code} · {material.material_name}</option>)}</select></FormField><FormField label="供應商料號" hint="選填；填寫供應商使用的料件編碼。"><input aria-label="供應商料號" name="supplier_material_code" className={inputClass} maxLength={80} /></FormField><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="is_preferred" />設為此物料的首選供應商</label><div className="flex gap-2 sm:col-span-2"><Button variant="default" disabled={linkBusy || !materialOptions.length}>{linkBusy ? "建立中…" : "建立關聯"}</Button><Button type="button" variant="secondary" disabled={linkBusy} onClick={() => setLinkingSupplier(null)}>取消</Button></div></form></Panel>}
      {success && (
        <p role="status" className="mb-4 text-sm text-emerald-800">
          {success}
        </p>
      )}
      {(queryError || (error && !dialogOpen)) && (
        <div className="mb-4">
          <ErrorState message={displayError} onRetry={() => void refetch()} />
        </div>
      )}
      <Panel
        title="供應商清單"
        description={`共 ${data?.total ?? "—"} 筆供應商資料 · 支援 API 關鍵字搜尋`}
        action={<span className="text-xs text-slate-500">每頁 20 筆</span>}
      >
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              aria-label="搜尋供應商"
              className={`${inputClass} pl-9`}
              placeholder="搜尋供應商代碼或名稱"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <label className="text-sm text-slate-700">狀態 <select aria-label="供應商狀態篩選" className={`${inputClass} mt-1 min-w-36`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">全部狀態</option><option value="active">啟用</option><option value="inactive">停用</option></select></label>
        </div>
        {loading ? (
          <LoadingState label="正在載入供應商資料…" />
        ) : data?.items.length ? (
          <DataTable>
            <TableHead>
              <TableRow>
                <Th>供應商代碼</Th>
                <Th>供應商名稱</Th>
                <Th>聯絡資訊</Th>
                <Th>國家／地區</Th>
                <Th>狀態</Th>
                <Th>文件／操作</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((supplier) => (
                <TableRow key={supplier.id}>
                  <Td className="font-medium text-slate-950">
                    {supplier.supplier_code}
                  </Td>
                  <Td>{supplier.supplier_name}</Td>
                  <Td>{supplier.contact_name || supplier.email || "—"}</Td>
                  <Td>{supplier.country || "—"}</Td>
                  <Td>
                    <StatusBadge value={supplier.status} />
                  </Td>
                  <Td><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setDocumentSupplier(supplier)}><FileText className="h-4 w-4" />資格文件</Button>{canWrite && <><Button variant="secondary" onClick={() => { setLinkingSupplier(supplier); setDialogOpen(false); setShowImport(false); setError("") }}>連結物料</Button><Button variant="secondary" onClick={() => openEditDialog(supplier)}>編輯資料</Button></>}</div></Td>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        ) : error && !data ? null : (
          <EmptyState
            title="查無供應商資料"
            description={
              query ? "請嘗試其他供應商代碼或名稱。" : "目前尚無供應商資料。"
            }
          />
        )}
        <Pagination
          page={page}
          pageSize={data?.page_size ?? 20}
          total={data?.total ?? 0}
          onChange={setPage}
        />
      </Panel>
      {documentSupplier && <SupplierDocumentsPanel supplier={documentSupplier} canWrite={canWrite} onClose={() => setDocumentSupplier(null)} />}
      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        editingSupplier={editingSupplier}
        isSubmitting={isSubmitting}
        submitError={error}
        onSubmit={onSubmit}
      />
    </section>
  );
}

function SupplierDocumentsPanel({ supplier, canWrite, onClose }: { supplier: Supplier; canWrite: boolean; onClose: () => void }) {
  const [documents, setDocuments] = useState<SupplierDocument[]>([]);
  const [selected, setSelected] = useState<SupplierDocument | null>(null);
  const [attachments, setAttachments] = useState<SupplierDocumentAttachment[]>([]);
  const [editing, setEditing] = useState<SupplierDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // React Hook Form 初始化
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting: saving },
  } = useForm<SupplierDocumentFormData>({
    resolver: zodResolver(supplierDocumentSchema),
    defaultValues: {
      doc_type: "",
      doc_name: "",
      doc_code: "",
      status: "active",
      issued_at: "",
      expires_at: "",
    },
  });
  
  // 當 editing 改變時重設表單
  useEffect(() => {
    if (editing) {
      reset({
        doc_type: editing.doc_type,
        doc_name: editing.doc_name,
        doc_code: editing.doc_code || "",
        status: editing.status,
        issued_at: editing.issued_at?.slice(0, 10) || "",
        expires_at: editing.expires_at?.slice(0, 10) || "",
      });
    } else {
      reset({
        doc_type: "",
        doc_name: "",
        doc_code: "",
        status: "active",
        issued_at: "",
        expires_at: "",
      });
    }
  }, [editing, reset]);
  const refresh = useCallback(async () => {
    try {
      const rows = await api.listSupplierDocuments(supplier.id);
      setDocuments(rows);
      setSelected((current) => current ? rows.find((item) => item.id === current.id) ?? null : null);
      setError("");
    } catch (err) { setError(`操作失敗：${formatErrorMessage(err)}`); }
    finally { setLoading(false); }
  }, [supplier.id]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await api.listSupplierDocuments(supplier.id);
        if (!active) return;
        setDocuments(rows);
        setSelected((current) => current ? rows.find((item) => item.id === current.id) ?? null : null);
        setError("");
      } catch (err) {
        if (active) setError(`操作失敗：${formatErrorMessage(err)}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [supplier.id]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    api.listSupplierDocumentAttachments(supplier.id, selected.id).then((rows) => { if (active) setAttachments(rows); }).catch((err: unknown) => { if (active) setError(`操作失敗：${formatErrorMessage(err)}`); });
    return () => { active = false; };
  }, [selected, supplier.id]);
  const onSubmit = async (formData: SupplierDocumentFormData) => {
    setError(""); setSuccess("");
    const dateValue = (value: string | undefined) => { return value ? new Date(`${value}T00:00:00`).toISOString() : undefined; };
    const payload = { 
      doc_type: formData.doc_type.trim(), 
      doc_code: optional(formData.doc_code), 
      doc_name: formData.doc_name.trim(), 
      issued_at: dateValue(formData.issued_at), 
      expires_at: dateValue(formData.expires_at), 
      status: formData.status 
    };
    try {
      if (editing) await api.updateSupplierDocument(supplier.id, editing.id, payload);
      else await api.createSupplierDocument(supplier.id, payload);
      setEditing(null); setSuccess(editing ? "資格文件已更新。" : "資格文件已建立。"); await refresh();
    } catch (err) { setError(`操作失敗：${formatErrorMessage(err)}`); }
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected) return;
    const input = event.currentTarget.elements.namedItem("attachment") as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setSuccess("");
    try { await api.uploadSupplierDocumentAttachment(supplier.id, selected.id, file); setSuccess("附件已上傳並安全保存。"); input.value = ""; setAttachments(await api.listSupplierDocumentAttachments(supplier.id, selected.id)); }
    catch (err) { setError(`操作失敗：${formatErrorMessage(err)}`); }
    finally { setBusy(false); }
  };
  const download = async (attachment: SupplierDocumentAttachment) => {
    if (!selected) return;
    setError("");
    try { const blob = await api.downloadSupplierDocumentAttachment(supplier.id, selected.id, attachment.id); const url = URL.createObjectURL(blob); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = attachment.original_filename; anchor.click(); URL.revokeObjectURL(url); }
    catch (err) { setError(`操作失敗：${formatErrorMessage(err)}`); }
  };
  const removeAttachment = async (attachment: SupplierDocumentAttachment) => {
    if (!selected) return;
    await api.deleteSupplierDocumentAttachment(supplier.id, selected.id, attachment.id);
    setAttachments((items) => items.filter((item) => item.id !== attachment.id));
    setSuccess("附件已刪除。");
  };
  const removeDocument = async (document: SupplierDocument) => {
    await api.deleteSupplierDocument(supplier.id, document.id);
    setDocuments((items) => items.filter((item) => item.id !== document.id));
    if (selected?.id === document.id) setSelected(null);
    setSuccess("資格文件及其附件已刪除。");
  };
  return <Panel title={`資格文件：${supplier.supplier_name}`} description="文件 metadata 與附件分開管理；附件透過授權 API 下載，支援 PDF、PNG、JPEG。" className="mt-5" action={<Button variant="secondary" onClick={onClose}>關閉</Button>}>
    {error && <div className="mb-3"><ErrorState message={error} onRetry={() => void refresh()} /></div>}{success && <div className="mb-3"><SuccessMessage>{success}</SuccessMessage></div>}
    {canWrite && <form key={editing?.id ?? `new-${supplier.id}`} onSubmit={handleSubmit(onSubmit)} noValidate className="mb-5 grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <FormField label="文件類型"><input {...register("doc_type")} className={inputClass} maxLength={50} />{errors.doc_type && <span className="text-sm text-rose-600">{errors.doc_type.message}</span>}</FormField>
      <FormField label="文件名稱"><input {...register("doc_name")} className={inputClass} maxLength={200} />{errors.doc_name && <span className="text-sm text-rose-600">{errors.doc_name.message}</span>}</FormField>
      <FormField label="文件編號"><input {...register("doc_code")} className={inputClass} maxLength={80} />{errors.doc_code && <span className="text-sm text-rose-600">{errors.doc_code.message}</span>}</FormField>
      <FormField label="狀態"><select {...register("status")} className={inputClass}><option value="active">有效</option><option value="expired">已到期</option><option value="inactive">停用</option></select>{errors.status && <span className="text-sm text-rose-600">{errors.status.message}</span>}</FormField>
      <FormField label="發證日"><input {...register("issued_at")} className={inputClass} type="date" />{errors.issued_at && <span className="text-sm text-rose-600">{errors.issued_at.message}</span>}</FormField>
      <FormField label="到期日"><input {...register("expires_at")} className={inputClass} type="date" />{errors.expires_at && <span className="text-sm text-rose-600">{errors.expires_at.message}</span>}</FormField>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2"><Button variant="default" disabled={saving}>{saving ? "儲存中…" : editing ? "儲存變更" : "新增文件"}</Button>{editing && <Button type="button" variant="secondary" onClick={() => setEditing(null)}>取消編輯</Button>}</div>
    </form>}
    {loading ? <LoadingState label="正在載入資格文件…" /> : documents.length ? <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]"><DataTable><TableHead><TableRow><Th>文件</Th><Th>類型／編號</Th><Th>狀態</Th><Th>操作</Th></TableRow></TableHead><TableBody>{documents.map((document) => <TableRow key={document.id}><Td><button className="font-medium text-sky-800 hover:underline" onClick={() => setSelected(document)}>{document.doc_name}</button></Td><Td>{document.doc_type}<span className="block text-xs text-slate-500">{document.doc_code || "—"}</span></Td><Td><StatusBadge value={document.status} /></Td><Td><div className="flex gap-2">{canWrite && (<><Button variant="secondary" onClick={() => { setEditing(document); setSelected(document); }}>編輯</Button><ConfirmDialog trigger={<Button variant="secondary"><Trash2 className="h-4 w-4" />刪除</Button>} title="刪除資格文件？" description="文件及其附件 metadata 將一併刪除，實際附件檔案也會在資料庫交易成功後移除。" confirmLabel="刪除文件" destructive onConfirm={() => removeDocument(document)} /></>)}</div></Td></TableRow>)}</TableBody></DataTable>
      <div className="rounded-md border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">{selected ? selected.doc_name : "選取文件以管理附件"}</h3>{selected && <><p className="mt-1 text-xs text-slate-500">發證：{selected.issued_at ? new Date(selected.issued_at).toLocaleDateString("zh-TW") : "—"} · 到期：{selected.expires_at ? new Date(selected.expires_at).toLocaleDateString("zh-TW") : "—"}</p>{canWrite && <form onSubmit={upload} className="mt-4 flex flex-wrap items-end gap-2"><FormField label="新增附件"><input className={inputClass} type="file" name="attachment" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required /></FormField><Button variant="default" disabled={busy}><Upload className="h-4 w-4" />{busy ? "上傳中…" : "上傳附件"}</Button></form>}<div className="mt-4 space-y-2">{attachments.length ? attachments.map((attachment) => <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"><span className="min-w-0"><span className="block truncate text-sm">{attachment.original_filename}</span><span className="text-xs text-slate-500">{Math.ceil(attachment.size_bytes / 1024)} KB · {attachment.media_type}</span></span><div className="flex gap-2"><Button variant="secondary" onClick={() => void download(attachment)}><Download className="h-4 w-4" />下載</Button>{canWrite && <ConfirmDialog trigger={<Button variant="secondary" aria-label={`刪除 ${attachment.original_filename}`}><Trash2 className="h-4 w-4" /></Button>} title="刪除附件？" description="此操作只會刪除目前文件所屬的附件。" confirmLabel="刪除附件" destructive onConfirm={() => removeAttachment(attachment)} />}</div></div>) : <EmptyState title="尚無附件" description="可上傳 PDF、PNG 或 JPEG，單檔大小上限依後端設定。" />}</div></>}</div></div> : <EmptyState title="尚無資格文件" description="具備供應商管理權限的使用者可新增文件。" />}
  </Panel>;
}

function SupplierImportPanel({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<SupplierImportPreview | null>(null);
  const [result, setResult] = useState<SupplierImportResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "template" | "preview" | "confirm">("");

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setFileName(selected?.name ?? "");
    setPreview(null);
    setResult(null);
    setError("");
    setNotice("");
  };

  const downloadTemplate = async () => {
    setBusy("template");
    setError("");
    try {
      const blob = await api.supplierImportTemplate();
      triggerDownload(blob, "supplier-import-template.xlsx");
    } catch (err) {
      setError(`操作失敗：${getErrorMessage(err)}`);
    } finally {
      setBusy("");
    }
  };

  const runPreview = async () => {
    if (!file) {
      setError("請先選擇要匯入的 Excel 檔案。");
      return;
    }
    setBusy("preview");
    setError("");
    setNotice("");
    setResult(null);
    try {
      setPreview(await api.previewSupplierImport(file));
    } catch (err) {
      setPreview(null);
      setError(`操作失敗：${formatErrorMessage(err)}`);
    } finally {
      setBusy("");
    }
  };

  const runConfirm = async () => {
    if (!file) {
      setError("請先選擇要匯入的 Excel 檔案。");
      return;
    }
    setBusy("confirm");
    setError("");
    setNotice("");
    try {
      const data = await api.confirmSupplierImport(file);
      setResult(data);
      setPreview(null);
      if (data.status === "completed") {
        onImported();
        setNotice(
          `匯入完成：新增 ${data.created} 筆供應商與登入帳號，略過 ${data.skipped} 筆。`,
        );
      } else {
        setError("匯入未執行：檔案仍有驗證錯誤，請修正後重新上傳。");
      }
    } catch (err) {
      setError(`操作失敗：${formatErrorMessage(err)}`);
    } finally {
      setBusy("");
    }
  };

  const errors = result?.errors.length
    ? result.errors
    : (preview?.errors ?? []);
  const canConfirm =
    Boolean(preview) &&
    (preview?.error_rows ?? 1) === 0 &&
    (preview?.valid_rows ?? 0) + (preview?.skipped_rows ?? 0) > 0 &&
    busy === "";

  const downloadErrorReport = () => {
    const rows: string[][] = [
      ["sheet", "row", "field", "message"],
      ...errors.map((item) => [
        item.sheet,
        String(item.row),
        item.field,
        item.message,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    triggerDownload(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
      "supplier-import-errors.csv",
    );
  };

  return (
    <Panel
      title="供應商批次匯入"
      description="下載範本後填入資料，上傳可先預覽驗證，確認無誤再寫入。每列會建立一筆供應商與其登入帳號。"
      className="mb-5"
      action={
        <Button
          variant="secondary"
          disabled={busy !== ""}
          onClick={() => void downloadTemplate()}
        >
          <Download className="h-4 w-4" />
          {busy === "template" ? "下載中…" : "下載 Excel 範本"}
        </Button>
      }
    >
      <div className="space-y-4">
        <FormField
          label="匯入檔案"
          hint="僅支援 .xlsx，單檔上限 5 MB、最多 1000 列資料。"
        >
          <input
            aria-label="選擇供應商匯入檔案"
            type="file"
            accept=".xlsx"
            className={inputClass}
            onChange={selectFile}
          />
        </FormField>
        {fileName && (
          <p className="text-xs text-slate-500">已選擇：{fileName}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!file || busy !== ""}
            onClick={() => void runPreview()}
          >
            {busy === "preview" ? "驗證中…" : "預覽驗證"}
          </Button>
          <Button
            variant="default"
            disabled={!canConfirm}
            onClick={() => void runConfirm()}
          >
            {busy === "confirm" ? "匯入中…" : "確認匯入"}
          </Button>
          {errors.length > 0 && (
            <Button
              variant="secondary"
              onClick={downloadErrorReport}
            >
              <Download className="h-4 w-4" />
              下載錯誤報告
            </Button>
          )}
        </div>

        {busy === "preview" && <LoadingState label="正在驗證 Excel 內容…" />}
        {busy === "confirm" && (
          <LoadingState label="正在寫入供應商與登入帳號…" />
        )}

        {notice && <SuccessMessage>{notice}</SuccessMessage>}
        {error && <ErrorState message={error} />}

        {result && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="成功建立"
              value={result.created}
              detail="供應商與登入帳號"
            />
            <Metric
              label="略過"
              value={result.skipped}
              detail="已存在，未重複建立"
            />
            <Metric
              label="失敗"
              value={result.failed}
              detail="未寫入任何資料"
            />
          </div>
        )}

        {preview && (
          <div className="grid gap-4 sm:grid-cols-4">
            <Metric
              label="總列數"
              value={preview.total_rows}
              detail="工作表資料列"
            />
            <Metric
              label="待匯入"
              value={preview.valid_rows}
              detail="將新增資料"
            />
            <Metric label="略過" value={preview.skipped_rows} detail="已存在" />
            <Metric label="錯誤" value={preview.error_rows} detail="需修正" />
          </div>
        )}

        {errors.length > 0 && (
          <DataTable>
            <TableHead>
              <TableRow>
                <Th>工作表</Th>
                <Th>列號</Th>
                <Th>欄位</Th>
                <Th>錯誤原因</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {errors.map((item, index) => (
                <TableRow
                  key={`${item.sheet}-${item.row}-${item.field}-${index}`}
                >
                  <Td>{item.sheet}</Td>
                  <Td>{item.row}</Td>
                  <Td>{item.field}</Td>
                  <Td>{item.message}</Td>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        )}

        {result?.accounts.length ? (
          <DataTable>
            <TableHead>
              <TableRow>
                <Th>列號</Th>
                <Th>供應商代碼</Th>
                <Th>登入帳號</Th>
                <Th>初始密碼</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.accounts.map((account) => (
                <TableRow key={`${account.row}-${account.login_username}`}>
                  <Td>{account.row}</Td>
                  <Td>{account.supplier_code}</Td>
                  <Td>{account.login_username}</Td>
                  <Td className="font-mono">
                    {account.initial_password}
                    {account.password_generated && (
                      <span className="ml-2 text-xs text-slate-500">
                        （系統產生）
                      </span>
                    )}
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        ) : null}
        {result?.accounts.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-rose-700">
              初始密碼僅顯示本次，請立即妥善保存並通知供應商。供應商首次登入時必須變更密碼。
            </p>
            <Button
              variant="secondary"
              onClick={() =>
                setResult((previous) =>
                  previous ? { ...previous, accounts: [] } : previous,
                )
              }
            >
              清除密碼顯示
            </Button>
          </div>
        ) : null}

        {!preview && !result && errors.length === 0 && busy === "" && (
          <EmptyState
            title="尚未驗證任何資料"
            description="選擇 Excel 檔案後點選「預覽驗證」，確認結果後再執行匯入。"
          />
        )}
      </div>
    </Panel>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  const text = String(value ?? "");
  // Neutralize spreadsheet formula injection before quoting for CSV.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
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
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
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
function optional(value: FormDataEntryValue | null | string | undefined) {
  const result = String(value ?? "").trim();
  return result || undefined;
}