import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { api } from "../../api/client";
import { getErrorMessage } from "../../lib/data";
import {
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
import type {
  UserProfile,
  PaginatedResponse,
  InternalLot,
} from "./types";
import { Pagination } from "./components/SharedComponents";

export function InternalLotsPage({ profile: _profile }: { profile: UserProfile | null }) {
  const [lots, setLots] = useState<PaginatedResponse<InternalLot> | null>(null);
  const [lotQuery, setLotQuery] = useState("");
  const [lotStatus, setLotStatus] = useState("");
  const [lotPage, setLotPage] = useState(1);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [selectedLot, setSelectedLot] = useState<InternalLot | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInternalLots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.listInternalLots({
        keyword: lotQuery || undefined,
        status: lotStatus || undefined,
        page: lotPage,
        page_size: 50,
      });
      setLots(response);
      // 不再自動選取第一筆
    } catch (err) {
      setLots(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [lotQuery, lotStatus, lotPage]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void loadInternalLots();
      },
      lotQuery ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [loadInternalLots, lotQuery]);

  // 載入詳情
  useEffect(() => {
    if (selectedLotId === null) {
      setSelectedLot(null);
      return;
    }

    let active = true;
    setDetailLoading(true);
    api
      .getInternalLot(selectedLotId)
      .then((lot) => {
        if (active) setSelectedLot(lot);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedLotId]);

  const closeDetail = () => {
    setSelectedLotId(null);
    setSelectedLot(null);
  };

  return (
    <section>
      <PageHeader
        eyebrow="進料管理"
        title="內部批號"
        description="管理已建立的內部物料批號，追蹤庫存與使用狀態。"
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void loadInternalLots()} />
        </div>
      )}

      <div className="space-y-5">
        <Panel title="內部批號列表">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <input
                className={inputClass}
                placeholder="搜尋內部批號..."
                value={lotQuery}
                onChange={(e) => setLotQuery(e.target.value)}
              />
            </div>
            <select
              className={`${inputClass} w-full sm:w-44`}
              value={lotStatus}
              onChange={(e) => setLotStatus(e.target.value)}
            >
              <option value="">全部狀態</option>
              <option value="active">有效</option>
              <option value="used">已使用</option>
              <option value="scrapped">已報廢</option>
            </select>
          </div>

          {loading ? (
            <LoadingState label="正在載入內部批號..." />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void loadInternalLots()} />
          ) : !lots?.items.length ? (
            <EmptyState title="目前沒有內部批號" />
          ) : (
            <>
              <DataTable>
                <TableHead>
                  <TableRow>
                    <Th>內部批號</Th>
                    <Th>物料</Th>
                    <Th>數量</Th>
                    <Th>狀態</Th>
                    <Th>建立日期</Th>
                    <Th>操作</Th>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lots.items.map((lot) => (
                    <TableRow key={lot.id}>
                      <Td className="font-medium">{lot.internal_lot_no}</Td>
                      <Td>物料ID: {lot.material_id}</Td>
                      <Td>{lot.qty_on_hand}</Td>
                      <Td>
                        <StatusBadge value={lot.lot_status} />
                      </Td>
                      <Td>{new Date(lot.created_at).toLocaleDateString()}</Td>
                      <Td>
                        <button
                          className="text-sm text-blue-600 hover:underline"
                          onClick={() => setSelectedLotId(lot.id)}
                        >
                          查看詳情
                        </button>
                      </Td>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
              <Pagination
                page={lotPage}
                pageSize={50}
                total={lots.total}
                onChange={setLotPage}
              />
            </>
          )}
        </Panel>
      </div>

      {/* 批號詳情 Dialog */}
      <Dialog.Root
        open={selectedLotId !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100vw-32px))] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl focus:outline-none">
            {detailLoading || !selectedLot ? (
              <div className="flex items-center justify-center py-16">
                <LoadingState label="正在載入批號詳情…" />
              </div>
            ) : (
              <>
                {/* 標題區 */}
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-slate-900">
                      批號詳情
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedLot.internal_lot_no}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge value={selectedLot.lot_status} />
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="關閉"
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>

                {/* 內容區 */}
                <div className="space-y-6 px-6 py-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-xs font-medium text-slate-500">內部批號</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {selectedLot.internal_lot_no}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-xs font-medium text-slate-500">物料 ID</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {selectedLot.material_id}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-xs font-medium text-slate-500">庫存數量</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {selectedLot.qty_on_hand}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-xs font-medium text-slate-500">狀態</p>
                      <p className="mt-1">
                        <StatusBadge value={selectedLot.lot_status} />
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-xs font-medium text-slate-500">建立日期</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {new Date(selectedLot.created_at).toLocaleString("zh-TW")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-xs font-medium text-slate-500">來源收料單 ID</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {selectedLot.receipt_id ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}