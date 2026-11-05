import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Trash2, X, Upload } from "lucide-react";
import * as Dialog from '@radix-ui/react-dialog';
import { api } from "../../api";
import { formatErrorMessage } from "../../lib/error";
import { Button } from "@/components/shadcn/button";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  StatusBadge,
  SuccessMessage,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../../components/ui";
import { optional } from "./utils";
import type {
  Supplier,
  SupplierDocument,
  SupplierDocumentAttachment,
} from "../../types";

const supplierDocumentSchema = z.object({
  doc_type: z.string().min(1, "文件類型為必填").max(50, "文件類型最多50字元"),
  doc_name: z.string().min(1, "文件名稱為必填").max(200, "文件名稱最多200字元"),
  doc_code: z.string().max(80, "文件編號最多80字元").optional(),
  status: z.string().min(1, "狀態為必填").max(20, "狀態最多20字元"),
  issued_at: z.string().optional(),
  expires_at: z.string().optional(),
});

type SupplierDocumentFormData = z.infer<typeof supplierDocumentSchema>;

export function SupplierDocumentsPanel({ supplier, canWrite, onClose }: { supplier: Supplier; canWrite: boolean; onClose: () => void }) {
    const [documents, setDocuments] = useState<SupplierDocument[]>([]);
    const [selected, setSelected] = useState<SupplierDocument | null>(null);
    const [attachments, setAttachments] = useState<SupplierDocumentAttachment[]>([]);
    const [editing, setEditing] = useState<SupplierDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleOpenChange = (open: boolean) => {
      if (!open) onClose();
    };
  
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
  return (
    <Dialog.Root open={true} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-[1000px] translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg bg-white p-6 shadow-lg animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              資格文件：{supplier.supplier_name}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">關閉</span>
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-slate-500 mb-6">
            文件 metadata 與附件分開管理；附件透過授權 API 下載，支援 PDF、PNG、JPEG。
          </Dialog.Description>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
