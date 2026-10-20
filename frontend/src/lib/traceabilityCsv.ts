import type { TraceabilityReceipt } from "../types";

export function buildTraceabilityPageCsv(items: TraceabilityReceipt[]): string {
  const rows = [["Supplier", "Material", "Supplier lot", "Receipt", "Internal lot", "IQC", "Inspection", "Release", "Review", "Review note"]];
  for (const entry of items) {
    const branches = entry.internal_lots.length ? entry.internal_lots : [{ internal_lot: null, iqc_records: [] }];
    for (const branch of branches) {
      const inspections = branch.iqc_records.length ? branch.iqc_records : [{ iqc_record: null, review_history: [] }];
      for (const item of inspections) {
        const reviews = item.review_history.length ? item.review_history : [null];
        for (const review of reviews) rows.push([
          `${entry.supplier.supplier_code} ${entry.supplier.supplier_name}`,
          `${entry.material.material_code} ${entry.material.material_name}`,
          entry.supplier_lot.supplier_lot_no,
          entry.receipt.receipt_no,
          branch.internal_lot?.internal_lot_no ?? "",
          item.iqc_record?.id ? `IQC-${item.iqc_record.id}` : "",
          item.iqc_record?.inspection_result ?? "",
          item.iqc_record?.release_status ?? "",
          review?.review_status ?? "",
          review?.reason ?? review?.decision_note ?? "",
        ]);
      }
    }
  }
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}
