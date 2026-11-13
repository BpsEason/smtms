import { Alert, Card, Empty, Flex, Spin, Typography } from "antd";
import { QualityTrendChart } from "../QualityTrendChart";
import type { QualityTrendResponse } from "../../types";

const { Text } = Typography;

type QualityTrendSectionProps = {
  data: QualityTrendResponse;
  loading: boolean;
  error: Error | null;
};

export function QualityTrendSection({ data, loading, error }: QualityTrendSectionProps) {
  return (
    <Card
      title="品質趨勢"
      extra={<Text type="secondary">依 IQC 檢驗日期彙總每月檢驗量與合格率</Text>}
      style={{ marginBottom: 24 }}
    >
      {loading ? (
        <Flex align="center" style={{ padding: "60px 0" }}>
          <Spin size="large" />
        </Flex>
      ) : error ? (
        <Alert type="error" showIcon message="品質趨勢讀取失敗" description="請重試品質趨勢查詢。" />
      ) : data.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Flex vertical gap={4} align="center">
              <Text strong>尚無品質趨勢資料</Text>
              <Text type="secondary">在區間內沒有可統計的 IQC 檢驗紀錄。</Text>
            </Flex>
          }
        />
      ) : (
        <QualityTrendChart data={data} />
      )}
    </Card>
  );
}