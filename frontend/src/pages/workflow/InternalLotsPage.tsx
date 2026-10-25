import { useCallback, useEffect, useState } from "react";
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
  SuccessMessage,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 保留變數結構但標註未使用，維持原始程式碼結構
  const [_success, _setSuccess] = useState("");


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
      setSelectedLotId((current) =>
        current !== null && response.items.some((item) => item.id === current)
          ? current
          : (response.items[0]?.id ?? null),
      );
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

  useEffect(() => {
    if (selectedLotId === null) return;
    let active = true;
    api
      .getInternalLot(selectedLotId)
      .then((lot) => {
        if (active) setSelectedLot(lot);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [selectedLotId]);

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
      {_success && (
        <div className="mb-4">
          <SuccessMessage>{_success}</SuccessMessage>
        </div>
      )}
      <div className="space-y-5">
        <Panel title="內部批號列表">
          <div className="mb-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input
                className={inputClass}
                placeholder="搜尋內部批號..."
                value={lotQuery}
                onChange={(e) => setLotQuery(e.target.value)}
              />
            </div>
            <select
              className={inputClass}
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
                    <TableRow
                      key={lot.id}
                      className={selectedLotId === lot.id ? "bg-slate-100" : ""}
                      onClick={() => setSelectedLotId(lot.id)}
                    >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLotId(lot.id);
                          }}
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

        {selectedLot && (
          <Panel title="批號詳情">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">內部批號</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedLot.internal_lot_no}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">物料ID</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedLot.material_id}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">庫存數量</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedLot.qty_on_hand}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">狀態</p>
                <p className="mt-1">
                  <StatusBadge value={selectedLot.lot_status} />
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">建立日期</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{new Date(selectedLot.created_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">來源收料單ID</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedLot.receipt_id ?? "-"}</p>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </section>
  );
}