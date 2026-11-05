import {
  useState,
  type ChangeEvent,
} from "react";
import { Download } from "lucide-react";
import { api } from "../../api";
import { formatErrorMessage } from "../../lib/error";
import { getErrorMessage } from "../../lib/data";
import { Button } from "@/components/shadcn/button";
import {
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  inputClass,
  LoadingState,
  Metric,
  Panel,
  SuccessMessage,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Th,
} from "../../components/ui";
import { triggerDownload, csvCell } from "./utils";
import type {
  SupplierImportPreview,
  SupplierImportResult,
} from "../../types";

export function SupplierImportPanel({ onImported }: { onImported: () => void }) {
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
