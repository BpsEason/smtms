import { Button, Flex, Typography } from "antd";
import { RefreshCw } from "lucide-react";

const { Title, Text } = Typography;

type DashboardHeaderProps = {
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};

export function DashboardHeader({ loading, refreshing, onRefresh }: DashboardHeaderProps) {
  return (
    <Flex
      align="flex-start"
      justify="space-between"
      wrap="wrap"
      gap={12}
      style={{ width: "100%", marginBottom: 28, borderBottom: "1px solid #f0f0f0", paddingBottom: 16 }}
    >
      <Flex vertical gap={2} style={{ minWidth: 0 }}>
        <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.16em" }}>
          品保作業
        </Text>
        <Title level={2} style={{ margin: 0 }}>
          儀表板
        </Title>
        <Text type="secondary" style={{ marginTop: 4 }}>
          品質管理與物料追溯概況
        </Text>
      </Flex>
      <Button
        type="primary"
        onClick={onRefresh}
        disabled={loading || refreshing}
        icon={refreshing ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
      >
        重新整理
      </Button>
    </Flex>
  );
}