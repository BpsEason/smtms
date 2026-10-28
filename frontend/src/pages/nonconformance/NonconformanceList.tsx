import {
  DataTable,
  Panel,
  StatusBadge,
  Td,
  Th,
  TableBody,
  TableHead,
  TableRow,
  inputClass,
  EmptyState,
  LoadingState,
} from "../../components/ui";
import type { NonconformanceListProps } from "./types";
import { SOURCE_OPTIONS, STATUS_OPTIONS } from "./constants";

export function NonconformanceList({
  nonconformanceList,
  filters,
  errorMessage,
  isListLoading,
  onUpdateFilters,
  onSelectItem,
}: NonconformanceListProps) {
  return (
    <Panel
      title="案件清單"
      description="可依案件編號、標題、描述、狀態與供應商批號查詢。"
    >
      {/* 篩選區 */}
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <input
          aria-label="搜尋案件"
          placeholder="編號、標題或描述"
          className={inputClass}
          value={filters.q}
          onChange={(e) => onUpdateFilters("q", e.target.value)}
        />

        <select
          aria-label="異常來源"
          className={inputClass}
          value={filters.source}
          onChange={(e) => onUpdateFilters("source", e.target.value)}
        >
          <option value="">所有來源</option>
          {SOURCE_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <select
          aria-label="案件狀態"
          className={inputClass}
          value={filters.status}
          onChange={(e) => onUpdateFilters("status", e.target.value)}
        >
          <option value="">所有狀態</option>
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <input
          aria-label="供應商 ID 篩選"
          type="number"
          min="1"
          placeholder="供應商 ID"
          className={inputClass}
          value={filters.supplier_id}
          onChange={(e) => onUpdateFilters("supplier_id", e.target.value)}
        />

        <input
          aria-label="批號篩選"
          placeholder="供應商或內部批號"
          className={inputClass}
          value={filters.lot_no}
          onChange={(e) => onUpdateFilters("lot_no", e.target.value)}
        />
      </div>

      {/* 資料表格 */}
      <DataTable>
        <TableHead>
          <TableRow>
            <Th>案件編號</Th>
            <Th>標題</Th>
            <Th>來源</Th>
            <Th>嚴重程度</Th>
            <Th>狀態</Th>
            <Th>更新時間</Th>
          </TableRow>
        </TableHead>

        <TableBody>
          {nonconformanceList.map((item) => (
            <TableRow
              key={item.id}
              className="cursor-pointer"
              onClick={() => onSelectItem(item.id)}
            >
              <Td>
                <button className="font-medium text-sky-700 underline">
                  {item.case_no}
                </button>
              </Td>
              <Td>{item.title}</Td>
              <Td>{item.source}</Td>
              <Td>{item.severity}</Td>
              <Td>
                <StatusBadge value={item.status} />
              </Td>
              <Td>{new Date(item.updated_at).toLocaleString()}</Td>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>

      {isListLoading && (
        <LoadingState label="案件清單載入中…" />
      )}
      
      {!isListLoading && !nonconformanceList.length && !errorMessage && (
        <EmptyState
          title="目前沒有符合條件的案件。"
        />
      )}
    </Panel>
  );
}