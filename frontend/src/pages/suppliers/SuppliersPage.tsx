import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Search, Upload } from "lucide-react";
import { api } from "../../api";
import { formatErrorMessage } from "../../lib/error";
import { allMaterials, getErrorMessage } from "../../lib/data";
import { Button } from "@/components/shadcn/button";
import {
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../../components/ui";
import { SupplierFormDialog, type SupplierFormData } from "./SupplierFormDialog";
import { SupplierDocumentsPanel } from "./SupplierDocumentsPanel";
import { SupplierImportPanel } from "./SupplierImportPanel";
import { optional, Pagination } from "./utils";
import type {
  Material,
  Supplier,
  UserProfile,
} from "../../types";

export function SuppliersPage({ profile }: { profile: UserProfile | null }) {
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