import { Button, Card, Empty, Flex, Spin, Table, Tag, Typography } from "antd";
import type { DashboardTodos as DashboardTodosData, OpenNCItem, PendingIQCItem } from "../../types";
import { formatTaiwanDate, getStatusColor } from "./format";

const { Text } = Typography;

function getSeverityColor(severity: string): "red" | "orange" | "gold" | "green" | "default" {
  const normalized = severity.toLowerCase();
  if (normalized === "critical") return "red";
  if (normalized === "high") return "orange";
  if (normalized === "medium") return "gold";
  if (normalized === "low") return "green";
  return "default";
}

type DashboardTodosProps = {
  todos: DashboardTodosData | undefined;
  loading: boolean;
  onOpenIqc: (item: PendingIQCItem) => void;
  onOpenNc: (item: OpenNCItem) => void;
};

export function DashboardTodos({ todos, loading, onOpenIqc, onOpenNc }: DashboardTodosProps) {
  return (
    <>
      {todos?.pending_iqc && todos.pending_iqc.length > 0 && (
        <Card
          title="待審核 IQC"
          extra={<Text type="secondary">IQC 檢驗紀錄中 review_status = pending 的項目</Text>}
          style={{ marginBottom: 24 }}
        >
          {loading ? (
            <Flex align="center" style={{ padding: "60px 0" }}>
              <Spin size="large" />
            </Flex>
          ) : (
            <Table
              dataSource={todos.pending_iqc}
              columns={[
                { title: "IQC ID", dataIndex: "id", key: "id", width: 80 },
                { title: "收料單號", dataIndex: "receipt_no", key: "receipt_no", render: (v: string | null) => v ?? "—" },
                { title: "內部批號", dataIndex: "internal_lot_no", key: "internal_lot_no", render: (v: string | null) => v ?? "—" },
                {
                  title: "供應商",
                  key: "supplier",
                  render: (_, record: PendingIQCItem) =>
                    record.supplier_name
                      ? `${record.supplier_name} (${record.supplier_code})`
                      : record.supplier_code ?? "—",
                },
                {
                  title: "物料",
                  key: "material",
                  render: (_, record: PendingIQCItem) =>
                    record.material_name
                      ? `${record.material_name} (${record.material_code})`
                      : record.material_code ?? "—",
                },
                {
                  title: "檢驗結果",
                  dataIndex: "inspection_result",
                  key: "inspection_result",
                  render: (v: string) => <Tag color={getStatusColor(v)}>{v}</Tag>,
                },
                {
                  title: "建立時間",
                  key: "created_at",
                  render: (v: string) => formatTaiwanDate(v),
                },
                {
                  title: "操作",
                  key: "action",
                  width: 80,
                  render: (_, record: PendingIQCItem) => (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => onOpenIqc(record)}
                    >
                      詳細
                    </Button>
                  ),
                },
              ]}
              pagination={false}
              bordered
              size="middle"
              scroll={{ x: 800 }}
            />
          )}
        </Card>
      )}

      {todos?.open_nc && todos.open_nc.length > 0 && (
        <Card
          title="未結案不合格案件"
          extra={<Text type="secondary">不合格案件中 status 非 closed 的項目</Text>}
          style={{ marginBottom: 24 }}
        >
          {loading ? (
            <Flex align="center" style={{ padding: "60px 0" }}>
              <Spin size="large" />
            </Flex>
          ) : (
            <Table
              dataSource={todos.open_nc}
              columns={[
                { title: "案件 ID", dataIndex: "id", key: "id", width: 80 },
                { title: "案件編號", dataIndex: "case_no", key: "case_no" },
                { title: "標題", dataIndex: "title", key: "title", ellipsis: true },
                {
                  title: "狀態",
                  dataIndex: "status",
                  key: "status",
                  width: 100,
                  render: (v: string) => <Tag color={getStatusColor(v)}>{v}</Tag>,
                },
                {
                  title: "嚴重程度",
                  dataIndex: "severity",
                  key: "severity",
                  width: 100,
                  render: (v: string) => <Tag color={getSeverityColor(v)}>{v}</Tag>,
                },
                {
                  title: "供應商",
                  key: "supplier",
                  render: (_, record: OpenNCItem) =>
                    record.supplier_name
                      ? `${record.supplier_name} (${record.supplier_code})`
                      : record.supplier_code ?? "—",
                },
                {
                  title: "物料",
                  key: "material",
                  render: (_, record: OpenNCItem) =>
                    record.material_name
                      ? `${record.material_name} (${record.material_code})`
                      : record.material_code ?? "—",
                },
                {
                  title: "發現時間",
                  key: "found_at",
                  render: (v: string) => formatTaiwanDate(v),
                },
                {
                  title: "操作",
                  key: "action",
                  width: 80,
                  render: (_, record: OpenNCItem) => (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => onOpenNc(record)}
                    >
                      詳細
                    </Button>
                  ),
                },
              ]}
              pagination={false}
              bordered
              size="middle"
              scroll={{ x: 900 }}
            />
          )}
        </Card>
      )}

      {!loading && !todos?.pending_iqc?.length && !todos?.open_nc?.length && (
        <Card
          title="品保待辦"
          extra={<Text type="secondary">目前沒有待處理的待審核 IQC 或未結案不合格案件</Text>}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Flex vertical gap={4} align="center">
                <Text strong>沒有待辦項目</Text>
                <Text type="secondary">所有 IQC 已審核完成，且無未結案不合格案件。</Text>
              </Flex>
            }
          />
        </Card>
      )}
    </>
  );
}