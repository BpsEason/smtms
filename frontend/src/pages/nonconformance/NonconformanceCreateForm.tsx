import {
  buttonClass,
  secondaryButtonClass,
  Panel,
  FormField,
  inputClass,
} from "../../components/ui";
import type { NonconformanceCreateFormProps } from "./types";
import { SOURCE_OPTIONS, SEVERITY_OPTIONS } from "./constants";

export function NonconformanceCreateForm({
  isOpen,
  isLoading,
  createForm,
  onUpdateCreateForm,
  onSubmit,
  onClose,
}: NonconformanceCreateFormProps) {
  if (!isOpen) return null;

  return (
    <Panel title="建立品質異常案件">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        <FormField label="異常編號">
          <input
            required
            className={inputClass}
            value={createForm.case_no}
            onChange={(e) => onUpdateCreateForm("case_no", e.target.value)}
          />
        </FormField>

        <FormField label="標題">
          <input
            required
            className={inputClass}
            value={createForm.title}
            onChange={(e) => onUpdateCreateForm("title", e.target.value)}
          />
        </FormField>

        <FormField label="來源">
          <select
            className={inputClass}
            value={createForm.source}
            onChange={(e) => onUpdateCreateForm("source", e.target.value)}
          >
            {SOURCE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="嚴重程度">
          <select
            className={inputClass}
            value={createForm.severity}
            onChange={(e) => onUpdateCreateForm("severity", e.target.value)}
          >
            {SEVERITY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="發現時間">
          <input
            required
            type="datetime-local"
            className={inputClass}
            value={createForm.found_at}
            onChange={(e) => onUpdateCreateForm("found_at", e.target.value)}
          />
        </FormField>

        <FormField label="不良數量">
          <input
            type="number"
            min="0"
            step="0.0001"
            className={inputClass}
            value={createForm.defect_qty}
            onChange={(e) => onUpdateCreateForm("defect_qty", e.target.value)}
          />
        </FormField>

        <FormField label="供應商 ID（可選）">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={createForm.supplier_id}
            onChange={(e) => onUpdateCreateForm("supplier_id", e.target.value)}
          />
        </FormField>

        <FormField label="物料 ID（可選）">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={createForm.material_id}
            onChange={(e) => onUpdateCreateForm("material_id", e.target.value)}
          />
        </FormField>

        <FormField label="收料紀錄 ID（可選）">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={createForm.receipt_id}
            onChange={(e) => onUpdateCreateForm("receipt_id", e.target.value)}
          />
        </FormField>

        <FormField label="供應商批號 ID（可選）">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={createForm.supplier_lot_id}
            onChange={(e) => onUpdateCreateForm("supplier_lot_id", e.target.value)}
          />
        </FormField>

        <FormField label="內部批號 ID（可選）">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={createForm.internal_lot_id}
            onChange={(e) => onUpdateCreateForm("internal_lot_id", e.target.value)}
          />
        </FormField>

        <FormField label="IQC 紀錄 ID（可選）">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={createForm.iqc_record_id}
            onChange={(e) => onUpdateCreateForm("iqc_record_id", e.target.value)}
          />
        </FormField>

        <div className="md:col-span-2">
          <FormField label="異常描述">
            <textarea
              required
              rows={3}
              className={inputClass}
              value={createForm.description}
              onChange={(e) => onUpdateCreateForm("description", e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex gap-2 md:col-span-2">
          <button disabled={isLoading} className={buttonClass}>
            建立案件
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </form>
    </Panel>
  );
}