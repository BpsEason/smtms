import { Alert, Card, Empty, Flex, Typography } from "antd";
import { Link } from "react-router-dom";
import type { DashboardSummary } from "../../types";

const { Text } = Typography;

type QualityTodoSummaryProps = {
  summary: DashboardSummary | undefined;
  loading: boolean;
  hasError: boolean;
  canReadMaterials: boolean;
};

export function QualityTodoSummary({ summary, loading, hasError, canReadMaterials }: QualityTodoSummaryProps) {
  return (
    <Card
      title="品保待辦摘要"
      extra={<Text type="secondary">待審核數量依 IQC 統計（review_status = pending）</Text>}
      style={{ height: "100%" }}
    >
      {summary?.iqc ? (
        <Flex justify="space-between" align="center" wrap style={{ gap: 16 }}>
          <Flex align="center" gap={12}>
            <div className="grid h-10 w-10 place-items-center rounded-md bg-amber-50 text-amber-700">
              <span role="img" aria-label="clipboard">📋</span>
            </div>
            <Flex vertical>
              <Text style={{ fontSize: 28, fontWeight: 600, color: "#000" }}>{summary.iqc.pending_review}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>品保審核待處理</Text>
            </Flex>
          </Flex>
          <Link to="/iqc" style={{ color: "#0064c8", fontWeight: 500 }}>
            查看 IQC
          </Link>
        </Flex>
      ) : !loading && hasError ? (
        <Alert type="error" showIcon message="目前無法載入待辦" description="請重試儀表板統計查詢。" />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Flex vertical gap={4} align="center">
              <Text strong>沒有 IQC 統計資料</Text>
              <Text type="secondary">目前帳號無權限讀取 IQC 統計，或尚未取得統計資料。</Text>
            </Flex>
          }
        />
      )}

      {canReadMaterials && (
        <Flex vertical gap={8} style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
          <Flex align="center" gap={8}>
            <span role="img" aria-label="package">📦</span>
            <Text type="secondary" style={{ fontSize: 12 }}>內部批號可於追溯作業中查詢。</Text>
          </Flex>
          <Link to="/internal-lots" style={{ color: "#0064c8", fontWeight: 600, fontSize: 12 }}>
            瀏覽內部批號
          </Link>
        </Flex>
      )}
    </Card>
  );
}