import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Trash2, X } from "lucide-react";
import * as Dialog from '@radix-ui/react-dialog';
import { api } from "../../api";
import { formatErrorMessage } from "../../lib/error";
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
  buttonClass,
  secondaryButtonClass,
} from "../../components/ui";
import { optional } from "./utils";
import type {
  Supplier,
  SupplierDocument,
  SupplierDocumentAttachment,
  SupplierDocumentPayload,
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
    const [selected, setSelected] = useState<SupplierDocument | null>(null);
    const [editing, setEditing] = useState<SupplierDocument | null>(null);
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

  // ============ TanStack Query：遠端資料 ============

  const documentsQuery = useQuery<SupplierDocument[]>({
    queryKey: ["supplier-documents", supplier.id],
    queryFn: async () => api.listSupplierDocuments(supplier.id),
    retry: 0,
    staleTime: 30 * 1000,
  });

  const attachmentsQuery = useQuery<SupplierDocumentAttachment[]>({
    queryKey: ["supplier-document-attachments", supplier.id, selected?.id],
    queryFn: async () => api.listSupplierDocumentAttachments(supplier.id, selected!.id),
    enabled: !!selected,
    retry: 0,
    staleTime: 30 * 1000,
  });

  const documents = documentsQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const loading = documentsQuery.isLoading;

  const documentError = documentsQuery.error ? formatErrorMessage(documentsQuery.error) : "";
  const attachmentError = attachmentsQuery.error ? formatErrorMessage(attachmentsQuery.error) : "";
  const queryError = documentError || attachmentError;

  // ============ Mutations：寫入操作 ============

  const createDocumentMutation = useMutation({
    mutationFn: (payload: SupplierDocumentPayload) =>
      api.createSupplierDocument(supplier.id, payload),
    onSuccess: () => {
      void documentsQuery.refetch();
      setEditing(null);
      setSuccess("資格文件已建立。");
    },
  });

  const updateDocumentMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<SupplierDocumentPayload> }) =>
      api.updateSupplierDocument(supplier.id, id, payload),
    onSuccess: () => {
      void documentsQuery.refetch();
      setEditing(null);
      setSuccess("資格文件已更新。");
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: number) =>
      api.deleteSupplierDocument(supplier.id, documentId),
    onSuccess: (_, documentId) => {
      void documentsQuery.refetch();
      if (selected?.id === documentId) setSelected(null);
      setSuccess("資格文件及其附件已刪除。");
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: ({ documentId, file }: { documentId: number; file: File }) =>
      api.uploadSupplierDocumentAttachment(supplier.id, documentId, file),
    onSuccess: () => {
      void attachmentsQuery.refetch();
      setSuccess("附件已上傳並安全保存。");
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) =>
      api.deleteSupplierDocumentAttachment(supplier.id, selected!.id, attachmentId),
    onSuccess: () => {
      void attachmentsQuery.refetch();
      setSuccess("附件已刪除。");
    },
  });

  const isBusy =
    createDocumentMutation.isPending ||
    updateDocumentMutation.isPending ||
    deleteDocumentMutation.isPending ||
    uploadAttachmentMutation.isPending ||
    deleteAttachmentMutation.isPending;

  const displayError = error || queryError;

  const refresh = () => {
    void documentsQuery.refetch();
    if (selected) {
      void attachmentsQuery.refetch();
    }
  };

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
      if (editing) {
        await updateDocumentMutation.mutateAsync({ id: editing.id, payload });
      } else {
        await createDocumentMutation.mutateAsync(payload);
      }
    } catch (err) {
      setError(`操作失敗：${formatErrorMessage(err)}`);
    }
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected) return;
    const input = event.currentTarget.elements.namedItem("attachment") as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await uploadAttachmentMutation.mutateAsync({ documentId: selected.id, file });
      input.value = "";
    } catch (err) {
      setError(`操作失敗：${formatErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const download = async (attachment: SupplierDocumentAttachment) => {
    if (!selected) return;
    setError("");
    try {
      const blob = await api.downloadSupplierDocumentAttachment(supplier.id, selected.id, attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = attachment.original_filename; anchor.click(); URL.revokeObjectURL(url);
    } catch (err) {
      setError(`操作失敗：${formatErrorMessage(err)}`);
    }
  };

  const removeAttachment = async (attachment: SupplierDocumentAttachment) => {
    if (!selected) return;
    try {
      await deleteAttachmentMutation.mutateAsync(attachment.id);
    } catch (err) {
      setError(`操作失敗：${formatErrorMessage(err)}`);
    }
  };

  const removeDocument = async (document: SupplierDocument) => {
    try {
      await deleteDocumentMutation.mutateAsync(document.id);
    } catch (err) {
      setError(`操作失敗：${formatErrorMessage(err)}`);
    }
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
          {displayError && <div className="mb-3"><ErrorState message={displayError} onRetry={() => void refresh()} /></div>}{success && <div className="mb-3"><SuccessMessage>{success}</SuccessMessage></div>}
    {canWrite && <form key={editing?.id ?? `new-${supplier.id}`} onSubmit={handleSubmit(onSubmit)} noValidate className="mb-5 grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <FormField label="文件類型"><input {...register("doc_type")} className={inputClass} maxLength={50} />{errors.doc_type && <span className="text-sm text-rose-600">{errors.doc_type.message}</span>}</FormField>
      <FormField label="文件名稱"><input {...register("doc_name")} className={inputClass} maxLength={200} />{errors.doc_name && <span className="text-sm text-rose-600">{errors.doc_name.message}</span>}</FormField>
      <FormField label="文件編號"><input {...register("doc_code")} className={inputClass} maxLength={80} />{errors.doc_code && <span className="text-sm text-rose-600">{errors.doc_code.message}</span>}</FormField>
      <FormField label="狀態"><select {...register("status")} className={inputClass}><option value="active">有效</option><option value="expired">已到期</option><option value="inactive">停用</option></select>{errors.status && <span className="text-sm text-rose-600">{errors.status.message}</span>}</FormField>
      <FormField label="發證日"><input {...register("issued_at")} className={inputClass} type="date" />{errors.issued_at && <span className="text-sm text-rose-600">{errors.issued_at.message}</span>}</FormField>
      <FormField label="到期日"><input {...register("expires_at")} className={inputClass} type="date" />{errors.expires_at && <span className="text-sm text-rose-600">{errors.expires_at.message}</span>}</FormField>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2"><button type="submit" className={buttonClass} disabled={saving || isBusy}>{saving || isBusy ? "儲存中…" : editing ? "儲存變更" : "新增文件"}</button>{editing && <button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>取消編輯</button>}</div>
    </form>}
    {loading ? <LoadingState label="正在載入資格文件…" /> : documents.length ? <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]"><DataTable><TableHead><TableRow><Th>文件</Th><Th>類型／編號</Th><Th>狀態</Th><Th>操作</Th></TableRow></TableHead><TableBody>{documents.map((document) => <TableRow key={document.id}><Td><button className="font-medium text-sky-800 hover:underline" onClick={() => setSelected(document)}>{document.doc_name}</button></Td><Td>{document.doc_type}<span className="block text-xs text-slate-500">{document.doc_code || "—"}</span></Td><Td><StatusBadge value={document.status} /></Td><Td><div className="flex gap-2">{canWrite && (<><button className={secondaryButtonClass} onClick={() => { setEditing(document); setSelected(document); }}>編輯</button><ConfirmDialog trigger={<button className={secondaryButtonClass}><Trash2 className="h-4 w-4" />刪除</button>} title="刪除資格文件？" description="文件及其附件 metadata 將一併刪除，實際附件檔案也會在資料庫交易成功後移除。" confirmLabel="刪除文件" destructive onConfirm={() => removeDocument(document)} /></>)}</div></Td></TableRow>)}</TableBody></DataTable>
      <div className="rounded-md border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">{selected ? selected.doc_name : "選取文件以管理附件"}</h3>{selected && <><p className="mt-1 text-xs text-slate-500">發證：{selected.issued_at ? new Date(selected.issued_at).toLocaleDateString("zh-TW") : "—"} · 到期：{selected.expires_at ? new Date(selected.expires_at).toLocaleDateString("zh-TW") : "—"}</p>{canWrite && <form onSubmit={upload} className="mt-4 flex flex-wrap items-end gap-2"><FormField label="新增附件"><input className={inputClass} type="file" name="attachment" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required /></FormField><button type="submit" className={buttonClass} disabled={busy || isBusy}>{busy || isBusy ? "上傳中…" : "上傳附件"}</button></form>}<div className="mt-4 space-y-2">{attachments.length ? attachments.map((attachment) => <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"><span className="min-w-0"><span className="block truncate text-sm">{attachment.original_filename}</span><span className="text-xs text-slate-500">{Math.ceil(attachment.size_bytes / 1024)} KB · {attachment.media_type}</span></span><div className="flex gap-2"><button className={secondaryButtonClass} onClick={() => void download(attachment)}><Download className="h-4 w-4" />下載</button>{canWrite && <ConfirmDialog trigger={<button className={secondaryButtonClass} aria-label={`刪除 ${attachment.original_filename}`}><Trash2 className="h-4 w-4" /></button>} title="刪除附件？" description="此操作只會刪除目前文件所屬的附件。" confirmLabel="刪除附件" destructive onConfirm={() => removeAttachment(attachment)} />}</div></div>) : <EmptyState title="尚無附件" description="可上傳 PDF、PNG 或 JPEG，單檔大小上限依後端設定。" />}</div></>}</div></div> : <EmptyState title="尚無資格文件" description="具備供應商管理權限的使用者可新增文件。" />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
