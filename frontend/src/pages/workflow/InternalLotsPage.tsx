import { useState } from "react";
import { Descriptions, Modal, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { formatErrorMessage } from "../../lib/error";
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

const { Text, Title } = Typography;

export function InternalLotsPage({ profile: _profile }: { profile: UserProfile | null }) {
  const [lotQuery, setLotQuery] = useState("");
  const [lotStatus, setLotStatus] = useState("");
  const [lotPage, setLotPage] = useState(1);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);

  const {
    data: lots,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery<PaginatedResponse<InternalLot>>({
    queryKey: ["internal-lots", lotQuery, lotStatus, lotPage],
    queryFn: async () =>
      api.listInternalLots({
        keyword: lotQuery || undefined,
        status: lotStatus || undefined,
        page: lotPage,
        page_size: 50,
      }),
    retry: 1,
    staleTime: 30 * 1000,
  });

  const {
    data: selectedLot,
    isLoading: detailLoading,
    error: detailQueryError,
  } = useQuery<InternalLot>({
    queryKey: ["internal-lot", selectedLotId],
    queryFn: async () => api.getInternalLot(selectedLotId!),
    enabled: !!selectedLotId,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const closeDetail = () => {
    setSelectedLotId(null);
  };

  const displayError =
    (queryError ? formatErrorMessage(queryError) : "") ||
    (detailQueryError ? formatErrorMessage(detailQueryError) : "");

  return (
    <section>
      <PageHeader
        eyebrow="進料管理"
        title="內部批號"
        description="管理已建立的內部物料批號，追蹤庫存與使用狀態。"
      />

      {displayError && (
        <div className="mb-4">
          <ErrorState message={displayError} onRetry={() => void refetch()} />
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
          ) : displayError ? (
            <ErrorState message={displayError} onRetry={() => void refetch()} />
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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lots.items.map((lot) => (
                    <TableRow key={lot.id}>
                      <Td>
                        <button
                          type="button"
                          className="text-sm font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-1"
                          onClick={() => setSelectedLotId(lot.id)}
                        >
                          {lot.internal_lot_no}
                        </button>
                      </Td>
                      <Td>物料ID: {lot.material_id}</Td>
                      <Td>{lot.qty_on_hand}</Td>
                      <Td>
                        <StatusBadge value={lot.lot_status} />
                      </Td>
                      <Td>{new Date(lot.created_at).toLocaleDateString()}</Td>
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

      <Modal
        open={selectedLotId !== null}
        onCancel={closeDetail}
        title={
          selectedLot ? (
            <div className="flex flex-wrap items-center gap-3 pr-8">
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  批號詳情
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {selectedLot.internal_lot_no}
                </Text>
              </div>
              <StatusBadge value={selectedLot.lot_status} />
            </div>
          ) : (
            "批號詳情"
          )
        }
        width={640}
        footer={null}
        destroyOnHidden
        styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      >
        {detailLoading || !selectedLot ? (
          <LoadingState label="正在載入批號詳情…" />
        ) : (
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="內部批號">{selectedLot.internal_lot_no}</Descriptions.Item>
            <Descriptions.Item label="物料 ID">{selectedLot.material_id}</Descriptions.Item>
            <Descriptions.Item label="庫存數量">{selectedLot.qty_on_hand}</Descriptions.Item>
            <Descriptions.Item label="狀態">
              <StatusBadge value={selectedLot.lot_status} />
            </Descriptions.Item>
            <Descriptions.Item label="建立日期">
              {new Date(selectedLot.created_at).toLocaleString("zh-TW")}
            </Descriptions.Item>
            <Descriptions.Item label="來源收料單 ID">
              {selectedLot.receipt_id ?? "—"}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </section>
  );
}
