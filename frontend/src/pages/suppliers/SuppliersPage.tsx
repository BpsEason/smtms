import {
  useEffect,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Search, Upload } from "lucide-react";
import { api } from "../../api";
import { formatErrorMessage } from "../../lib/error";
import { allMaterials, getErrorMessage } from "../../lib/data";
import {
  DataTable,
  EmptyState,
  ErrorState,
  inputClass,
  buttonClass,
  secondaryButtonClass,
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
import { SupplierMaterialLinkDialog, type LinkMaterialFormData } from "./SupplierMaterialLinkDialog";
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
  const [linkMaterialDialogOpen, setLinkMaterialDialogOpen] = useState(false);
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
  const handleLinkMaterialDialogOpenChange = (open: boolean) => {
    setLinkMaterialDialogOpen(open);
    if (!open) {
      setLinkingSupplier(null);
    }
  };
  const openLinkMaterialDialog = (supplier: Supplier) => {
    setLinkingSupplier(supplier);
    setLinkMaterialDialogOpen(true);
    setShowImport(false);
    setError("");
    setSuccess("");
  };
  const linkMaterial = async (formData: LinkMaterialFormData) => {
    if (!linkingSupplier) return;
    setError("");
    setSuccess("");
    setLinkBusy(true);
    try {
      await api.createSupplierMaterial(linkingSupplier.id, {
        material_id: formData.material_id,
        supplier_material_code: optional(formData.supplier_material_code),
        is_preferred: formData.is_preferred,
      });
      setSuccess(`已建立「${linkingSupplier.supplier_name}」與所選物料的供應關聯。`);
      setLinkingSupplier(null);
      setLinkMaterialDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    } catch (err) {
      setError(`操作失敗：${formatErrorMessage(err)}`);
    } finally {
      setLinkBusy(false);
    }
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
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setShowImport((value) => !value);
                  setSuccess("");
                }}
              >
                <Upload className="h-4 w-4" />
                {showImport ? "關閉匯入" : "批次匯入"}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={openCreateDialog}
              >
                <Plus className="h-4 w-4" />
                新增供應商
              </button>
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
      <SupplierMaterialLinkDialog
        open={linkMaterialDialogOpen}
        onOpenChange={handleLinkMaterialDialogOpenChange}
        linkingSupplier={linkingSupplier}
        materialOptions={materialOptions}
        isSubmitting={linkBusy}
        submitError={error}
        onSubmit={linkMaterial}
      />
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
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="whitespace-nowrap">狀態</span>
            <select
              aria-label="供應商狀態篩選"
              className={`${inputClass} min-w-36 !bg-sky-600 !text-white border-sky-600`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部狀態</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </label>
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
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={secondaryButtonClass} onClick={() => setDocumentSupplier(supplier)}>
                        <FileText className="h-4 w-4" />
                        資格文件
                      </button>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            className={secondaryButtonClass}
                            onClick={() => openLinkMaterialDialog(supplier)}
                          >
                            連結物料
                          </button>
                          <button type="button" className={secondaryButtonClass} onClick={() => openEditDialog(supplier)}>
                            編輯資料
                          </button>
                        </>
                      )}
                    </div>
                  </Td>
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
      {documentSupplier && (
        <SupplierDocumentsPanel
          supplier={documentSupplier}
          canWrite={canWrite}
          onClose={() => setDocumentSupplier(null)}
        />
      )}
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