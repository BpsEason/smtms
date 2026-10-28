import { inputClass } from "../../../components/ui";

interface ReceiptFiltersProps {
  receiptQuery: string;
  receiptStatus: string;
  dateFrom: string;
  dateTo: string;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

export function ReceiptFilters({
  receiptQuery,
  receiptStatus,
  dateFrom,
  dateTo,
  onQueryChange,
  onStatusChange,
  onDateFromChange,
  onDateToChange,
}: ReceiptFiltersProps) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
      <div className="sm:col-span-1 md:col-span-2">
        <input
          className={inputClass}
          placeholder="搜尋收料單號、供應商或物料..."
          value={receiptQuery}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <select
        className={`${inputClass} min-w-[140px]`}
        value={receiptStatus}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="">全部狀態</option>
        <option value="pending">待處理</option>
        <option value="processing">處理中</option>
        <option value="completed">已完成</option>
        <option value="cancelled">已取消</option>
      </select>
      <input
        type="date"
        className={`${inputClass} min-w-[150px]`}
        value={dateFrom}
        onChange={(e) => onDateFromChange(e.target.value)}
      />
      <input
        type="date"
        className={`${inputClass} min-w-[150px]`}
        value={dateTo}
        onChange={(e) => onDateToChange(e.target.value)}
      />
    </div>
  );
}