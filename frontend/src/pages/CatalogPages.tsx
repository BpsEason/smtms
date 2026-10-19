import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Download, Plus, Search, Upload } from "lucide-react";
import { api, ApiError } from "../api/client";
import {
  buttonClass,
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
import type {
  Material,
  PaginatedResponse,
  Supplier,
  SupplierImportPreview,
  SupplierImportResult,
  UserProfile,
} from "../types";

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
    <MaterialsPage profile={profile} />
  );
}

function SuppliersPage({ profile }: { profile: UserProfile | null }) {
  const [data, setData] = useState<PaginatedResponse<Supplier> | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const canWrite = Boolean(profile?.permissions.includes("suppliers:write"));
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await api.listSuppliers({
          keyword: query || undefined,
          page,
          page_size: 20,
        }),
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, [query, page]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void load();
      },
      query ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [load, query]);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      await api.createSupplier({
        supplier_code: String(form.get("supplier_code")).trim(),
        supplier_name: String(form.get("supplier_name")).trim(),
        contact_name: optional(form.get("contact_name")),
        email: optional(form.get("email")),
        phone: optional(form.get("phone")),
        country: optional(form.get("country")),
        status: "active",
      });
      setSuccess("供應商已建立。");
      setShowForm(false);
      setPage(1);
      await load();
    } catch (err) {
      setError(message(err));
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
                className={buttonClass}
                onClick={() => setShowForm((value) => !value)}
              >
                <Plus className="h-4 w-4" />
                {showForm ? "關閉" : "新增供應商"}
              </button>
            </div>
          )
        }
      />
      {showImport && canWrite && (
        <SupplierImportPanel
          onImported={() => {
            setPage(1);
            void load();
          }}
        />
      )}
      {showForm && (
        <Panel title="新增供應商" className="mb-5">
          <form
            onSubmit={create}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <FormField label="供應商代碼">
              <input
                name="supplier_code"
                className={inputClass}
                required
                maxLength={80}
              />
            </FormField>
            <FormField label="供應商名稱">
              <input
                name="supplier_name"
                className={inputClass}
                required
                maxLength={200}
              />
            </FormField>
            <FormField label="聯絡人">
              <input
                name="contact_name"
                className={inputClass}
                maxLength={120}
              />
            </FormField>
            <FormField label="電子郵件">
              <input
                name="email"
                type="email"
                className={inputClass}
                maxLength={160}
              />
            </FormField>
            <FormField label="電話">
              <input name="phone" className={inputClass} maxLength={40} />
            </FormField>
            <FormField label="國家／地區">
              <input name="country" className={inputClass} maxLength={80} />
            </FormField>
            <div className="sm:col-span-2 xl:col-span-3">
              <button className={buttonClass}>建立供應商</button>
            </div>
          </form>
        </Panel>
      )}
      {success && (
        <p role="status" className="mb-4 text-sm text-emerald-800">
          {success}
        </p>
      )}
      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      )}
      <Panel
        title="供應商清單"
        description={`共 ${data?.total ?? "—"} 筆供應商資料 · 支援 API 關鍵字搜尋`}
        action={<span className="text-xs text-slate-500">每頁 20 筆</span>}
      >
        <div className="mb-4 flex gap-2">
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
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        ) : (
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
    </section>
  );
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
      setError(message(err));
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
      setError(message(err));
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
      setError(message(err));
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
        <button
          className={secondaryButtonClass}
          disabled={busy !== ""}
          onClick={() => void downloadTemplate()}
        >
          <Download className="h-4 w-4" />
          {busy === "template" ? "下載中…" : "下載 Excel 範本"}
        </button>
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
          <button
            className={secondaryButtonClass}
            disabled={!file || busy !== ""}
            onClick={() => void runPreview()}
          >
            {busy === "preview" ? "驗證中…" : "預覽驗證"}
          </button>
          <button
            className={buttonClass}
            disabled={!canConfirm}
            onClick={() => void runConfirm()}
          >
            {busy === "confirm" ? "匯入中…" : "確認匯入"}
          </button>
          {errors.length > 0 && (
            <button
              className={secondaryButtonClass}
              onClick={downloadErrorReport}
            >
              <Download className="h-4 w-4" />
              下載錯誤報告
            </button>
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
            <button
              className={secondaryButtonClass}
              onClick={() =>
                setResult((previous) =>
                  previous ? { ...previous, accounts: [] } : previous,
                )
              }
            >
              清除密碼顯示
            </button>
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

function MaterialsPage({ profile }: { profile: UserProfile | null }) {
  const [data, setData] = useState<PaginatedResponse<Material> | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const canWrite = Boolean(profile?.permissions.includes("materials:write"));
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await api.listMaterials({
          keyword: query || undefined,
          page,
          page_size: 20,
        }),
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, [query, page]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void load();
      },
      query ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [load, query]);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      await api.createMaterial({
        material_code: String(form.get("material_code")).trim(),
        material_name: String(form.get("material_name")).trim(),
        material_type: String(form.get("material_type")).trim(),
        uom: String(form.get("uom")).trim(),
        spec: optional(form.get("spec")),
        status: "active",
      });
      setSuccess("物料已建立。");
      setShowForm(false);
      setPage(1);
      await load();
    } catch (err) {
      setError(message(err));
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
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="h-4 w-4" />
              {showForm ? "關閉" : "新增物料"}
            </button>
          )
        }
      />
      {showForm && (
        <Panel title="新增物料" className="mb-5">
          <form
            onSubmit={create}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <FormField label="物料代碼">
              <input
                name="material_code"
                className={inputClass}
                required
                maxLength={80}
              />
            </FormField>
            <FormField label="物料名稱">
              <input
                name="material_name"
                className={inputClass}
                required
                maxLength={200}
              />
            </FormField>
            <FormField label="物料類別">
              <input
                name="material_type"
                className={inputClass}
                required
                maxLength={50}
              />
            </FormField>
            <FormField label="計量單位">
              <input
                name="uom"
                className={inputClass}
                required
                maxLength={30}
              />
            </FormField>
            <FormField label="規格">
              <input name="spec" className={inputClass} maxLength={255} />
            </FormField>
            <div className="flex items-end">
              <button className={buttonClass}>建立物料</button>
            </div>
          </form>
        </Panel>
      )}
      {success && (
        <p role="status" className="mb-4 text-sm text-emerald-800">
          {success}
        </p>
      )}
      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void load()} />
        </div>
      )}
      <Panel
        title="物料清單"
        description={`共 ${data?.total ?? "—"} 筆物料資料 · 支援 API 關鍵字搜尋`}
      >
        <div className="mb-4 flex gap-2">
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
                <Th>規格</Th>
                <Th>計量單位</Th>
                <Th>狀態</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((material) => (
                <TableRow key={material.id}>
                  <Td className="font-medium text-slate-950">
                    {material.material_code}
                  </Td>
                  <Td>{material.material_name}</Td>
                  <Td>{material.material_type}</Td>
                  <Td>{material.spec || "—"}</Td>
                  <Td>{material.uom}</Td>
                  <Td>
                    <StatusBadge value={material.status} />
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
    </section>
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
function optional(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || undefined;
}
function message(error: unknown) {
  return error instanceof ApiError
    ? `操作失敗：${error.details}`
    : "請求失敗，請確認網路連線後再試一次。";
}
