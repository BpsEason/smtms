import {
  useEffect,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { api } from "../../api/client";
import { formatErrorMessage } from "../../lib/error";
import { getErrorMessage } from "../../lib/data";
import {
  buttonClass,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
  inputClass,
} from "../../components/ui";
import { Button } from "@/components/shadcn/button";
import { MaterialFormDialog } from "./MaterialFormDialog";
import type { Material, UserProfile } from "../../types";

// 分頁元件（從原程式碼保留）
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
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-slate-500">
        第 {page} 頁，共 {totalPages} 頁（總計 {total} 筆）
      </span>
      <div className="flex gap-2">
        <button
          className={buttonClass}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          上一頁
        </button>
        <button
          className={buttonClass}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          下一頁
        </button>
      </div>
    </div>
  );
}

export function MaterialsPage({ profile }: { profile: UserProfile | null }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canWrite = Boolean(profile?.permissions.includes("materials:write"));

  // 僅對搜尋輸入應用防抖，分頁和篩選器立即生效
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  // 使用 TanStack Query 管理物料列表資料載入
  const {
    data,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['materials', debouncedQuery, status, page],
    queryFn: async () => {
      const response = await api.listMaterials({
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
  
  const handleSubmit = async (formData: {
    material_code: string;
    material_name: string;
    material_type: string;
    uom: string;
    spec?: string;
    status: string;
  }) => {
    setError("");
    setSuccess("");
    setIsSubmitting(true);
    try {
      const payload = {
        material_code: formData.material_code.trim(),
        material_name: formData.material_name.trim(),
        material_type: formData.material_type.trim(),
        uom: formData.uom.trim(),
        spec: formData.spec?.trim() || undefined,
        status: formData.status,
      };
      if (editingMaterial) {
        await api.updateMaterial(editingMaterial.id, payload);
        setSuccess(`物料「${payload.material_name}」資料已更新。`);
      } else {
        await api.createMaterial(payload);
        setSuccess("物料已建立。");
      }
      setDialogOpen(false);
      setEditingMaterial(null);
      setPage(1);
      // 使所有相關查詢快取失效，確保列表資料最新
      await queryClient.invalidateQueries({ queryKey: ['materials'] });
    } catch (err) {
      setError(`操作失敗：${formatErrorMessage(err)}`);
      // API 失敗時不關閉Modal，保留使用者輸入的資料
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateDialog = () => {
    setEditingMaterial(null);
    setError("");
    setDialogOpen(true);
  };

  const openEditDialog = (material: Material) => {
    setEditingMaterial(material);
    setError("");
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingMaterial(null);
    }
  };

  return (
    <section>
      <PageHeader
        eyebrow="主檔管理"
        title="物料管理"
        description="管理收料、庫存與檢驗作業使用的物料主檔。"
        action={
          canWrite && (
            <button
              className={buttonClass}
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" />
              新增物料
            </button>
          )
        }
      />
      {success && (
        <p role="status" className="mb-4 text-sm text-emerald-800">
          {success}
        </p>
      )}
      {displayError && (
        <div className="mb-4">
          <ErrorState message={displayError} onRetry={() => void refetch()} />
        </div>
      )}
      <Panel
        title="物料清單"
        description={`共 ${data?.total ?? "—"} 筆物料資料 · 支援 API 關鍵字搜尋`}
        action={<span className="text-xs text-slate-500">每頁 20 筆</span>}
      >
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              aria-label="搜尋物料"
              className={`${inputClass} pl-9`}
              placeholder="搜尋物料代碼或名稱"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <label className="text-sm text-slate-700">
            狀態{" "}
            <select
              aria-label="物料狀態篩選"
              className={`${buttonClass} mt-1 min-w-36`}
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
          <LoadingState label="正在載入物料資料…" />
        ) : data?.items.length ? (
          <DataTable>
            <TableHead>
              <TableRow>
                <Th>物料代碼</Th>
                <Th>物料名稱</Th>
                <Th>物料類別</Th>
                <Th>計量單位</Th>
                <Th>狀態</Th>
                <Th>操作</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((material: Material) => (
                <TableRow key={material.id}>
                  <Td className="font-medium text-slate-950">
                    {material.material_code}
                  </Td>
                  <Td>{material.material_name}</Td>
                  <Td>{material.material_type}</Td>
                  <Td>{material.uom}</Td>
                  <Td>
                    <StatusBadge value={material.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {canWrite && (
                        <Button
                          variant="secondary"
                          onClick={() => openEditDialog(material)}
                        >
                          編輯資料
                        </Button>
                      )}
                    </div>
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        ) : (
          <EmptyState
            title="查無物料資料"
            description={
              query ? "請嘗試其他物料代碼或名稱。" : "目前尚無物料資料。"
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

      <MaterialFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        editingMaterial={editingMaterial}
        isSubmitting={isSubmitting}
        submitError={displayError}
        onSubmit={handleSubmit}
      />
    </section>
  );
}