import { Alert, Card, Empty, Flex, Spin, Table, Tag, Typography } from "antd";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { PaginatedResponse, Receipt } from "../../types";
import { formatTaiwanDate, getStatusColor } from "./format";

const { Text } = Typography;

type RecentReceiptsProps = {
  receipts: PaginatedResponse<Receipt> | undefined;
  loading: boolean;
  error: Error | null;
};

export function RecentReceipts({ receipts, loading, error }: RecentReceiptsProps) {
  return (
    <Card
      title="最近收料紀錄"
      extra={
        <Link to="/receipts" style={{ color: "#0064c8", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
          查看收料紀錄
          <ArrowUpRight />
        </Link>
      }
      style={{ height: "100%" }}
    >
      {loading ? (
        <Flex align="center" style={{ padding: "40px 0" }}>
          <Spin />
        </Flex>
      ) : receipts?.items.length ? (
        <Table
          dataSource={receipts.items.slice(0, 6)}
          rowKey="receipt_no"
          columns={[
            { title: "收料單號", dataIndex: "receipt_no", key: "receipt_no" },
            { title: "收料日期", dataIndex: "received_at", key: "received_at", render: (v: string) => formatTaiwanDate(v) },
            { title: "剩餘數量", dataIndex: "qty_remaining", key: "qty_remaining", align: "right" },
            {
              title: "狀態",
              dataIndex: "status",
              key: "status",
              render: (v: string) => <Tag color={getStatusColor(v)}>{v}</Tag>,
            },
          ]}
          pagination={false}
          bordered
          size="small"
        />
      ) : error ? (
        <Alert type="error" showIcon message="收料資料讀取失敗" description="請依上方錯誤訊息重試；目前無法判斷是否有收料資料。" />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Flex vertical gap={4} align="center">
              <Text strong>尚無收料紀錄</Text>
              <Text type="secondary">建立收料紀錄後，資料會顯示於此。</Text>
            </Flex>
          }
        />
      )}
    </Card>
  );
}