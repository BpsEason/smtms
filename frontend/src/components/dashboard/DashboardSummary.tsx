import type { CSSProperties } from "react";
import {
  Col,
  Card,
  Empty,
  Flex,
  Progress,
  Row,
  Statistic,
  Tag,
  Typography,
} from "antd";
import { InboxOutlined, NumberOutlined } from "@ant-design/icons";
import type { DashboardSummary as DashboardSummaryData } from "../../types";
import { getStatusColor } from "./format";

const { Text } = Typography;

const HERO_PANEL_STYLE: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  height: "100%",
  borderRadius: 12,
  border: "1px solid #dbe8f7",
  background: "linear-gradient(135deg, #f5faff 0%, #e7f1fc 100%)",
  padding: "20px 24px",
};

const HERO_WATERMARK_STYLE: CSSProperties = {
  position: "absolute",
  right: 16,
  top: "50%",
  transform: "translateY(-50%)",
  fontSize: 104,
  lineHeight: 1,
  color: "#0064c8",
  opacity: 0.08,
  pointerEvents: "none",
};

const HERO_ICON_STYLE: CSSProperties = {
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: 56,
  height: 56,
  borderRadius: 14,
  background: "#ffffff",
  border: "1px solid #dbe8f7",
  boxShadow: "0 2px 8px rgba(0, 100, 200, 0.08)",
  color: "#0064c8",
};

const HERO_VALUE_STYLE: CSSProperties = {
  fontSize: 46,
  fontWeight: 700,
  lineHeight: 1.1,
  color: "#0b4a8f",
};

const PANEL_STYLE: CSSProperties = {
  height: "100%",
  borderRadius: 12,
  border: "1px solid #f0f0f0",
  background: "#ffffff",
  padding: "20px 24px",
};

const LOT_STATUS_ITEM_STYLE: CSSProperties = {
  flex: "1 1 240px",
  minWidth: 200,
  maxWidth: "100%",
};

export function hasVisibleSummaryBlocks(summary: DashboardSummaryData | undefined): boolean {
  return Boolean(
    summary?.receipts ||
      summary?.internal_lots ||
      summary?.iqc ||
      summary?.nonconformances,
  );
}

export function DashboardSummary({ summary }: { summary: DashboardSummaryData | undefined }) {
  const lotStatusEntries = summary?.internal_lots
    ? Object.entries(summary.internal_lots.by_lot_status)
    : [];
  const lotStatusTotal = lotStatusEntries.reduce(
    (sum, [, count]) => sum + (Number.isFinite(count) ? count : 0),
    0,
  );

  return (
    <>
      {summary?.receipts && (
        <Card
          title="收料統計"
          extra={<Text type="secondary">依收料紀錄彙總</Text>}
          style={{ marginBottom: 24 }}
          styles={{ body: { padding: 20 } }}
        >
          <div style={HERO_PANEL_STYLE}>
            <InboxOutlined aria-hidden className="hidden sm:block" style={HERO_WATERMARK_STYLE} />
            <Flex align="center" gap={20} wrap="wrap" style={{ position: "relative" }}>
              <div style={HERO_ICON_STYLE}>
                <InboxOutlined style={{ fontSize: 28 }} />
              </div>
              <Flex vertical gap={2} style={{ minWidth: 0 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  收料總數
                </Text>
                <Statistic
                  value={summary.receipts.total}
                  precision={0}
                  groupSeparator=","
                  styles={{ value: HERO_VALUE_STYLE }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  收料紀錄總筆數
                </Text>
              </Flex>
              <Flex
                vertical
                gap={2}
                align="flex-start"
                style={{ alignSelf: "flex-start" }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  統計單位
                </Text>
                <Text strong style={{ fontSize: 13 }}>
                  筆（收料紀錄）
                </Text>
              </Flex>
            </Flex>
          </div>
        </Card>
      )}

      {summary?.internal_lots && (
        <Card
          title="內部批號統計"
          extra={<Text type="secondary">依內部物料批次彙總</Text>}
          style={{ marginBottom: 24 }}
          styles={{ body: { padding: 20 } }}
        >
          <Row gutter={[20, 20]}>
            <Col xs={24} lg={7} xl={6}>
              <div style={HERO_PANEL_STYLE}>
                <NumberOutlined aria-hidden className="hidden sm:block" style={HERO_WATERMARK_STYLE} />
                <Flex vertical gap={10} style={{ position: "relative" }}>
                  <Flex align="center" gap={12}>
                    <div style={HERO_ICON_STYLE}>
                      <NumberOutlined style={{ fontSize: 28 }} />
                    </div>
                    <Text strong style={{ fontSize: 15 }}>
                      內部批次總數
                    </Text>
                  </Flex>
                  <Statistic
                    value={summary.internal_lots.total}
                    precision={0}
                    groupSeparator=","
                    styles={{ value: HERO_VALUE_STYLE }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    內部批號總筆數
                  </Text>
                </Flex>
              </div>
            </Col>
            <Col xs={24} lg={17} xl={18}>
              <div style={PANEL_STYLE}>
                <Flex
                  align="center"
                  justify="space-between"
                  wrap="wrap"
                  gap={8}
                  style={{ marginBottom: 16 }}
                >
                  <Text strong style={{ fontSize: 14 }}>
                    批號狀態分布
                  </Text>
                  {lotStatusEntries.length > 0 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      共 {lotStatusEntries.length} 種狀態 · 狀態數量合計 {lotStatusTotal}
                    </Text>
                  )}
                </Flex>
                {lotStatusEntries.length > 0 ? (
                  <Flex wrap="wrap" gap={16}>
                    {lotStatusEntries.map(([status, count]) => {
                      const percent =
                        lotStatusTotal > 0
                          ? Math.round((count / lotStatusTotal) * 1000) / 10
                          : 0;
                      return (
                        <div key={status} style={LOT_STATUS_ITEM_STYLE}>
                          <Flex
                            align="center"
                            justify="space-between"
                            gap={8}
                            style={{ marginBottom: 6 }}
                          >
                            <Tag color={getStatusColor(status)} style={{ marginInlineEnd: 0 }}>
                              {status}
                            </Tag>
                            <Flex align="center" gap={8}>
                              <Text strong style={{ fontSize: 13 }}>
                                {count}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {percent}%
                              </Text>
                            </Flex>
                          </Flex>
                          <Progress percent={percent} showInfo={false} size="small" />
                        </div>
                      );
                    })}
                  </Flex>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <Flex vertical gap={4} align="center">
                        <Text strong>尚無批號狀態資料</Text>
                        <Text type="secondary">目前沒有可統計的內部批號狀態分布。</Text>
                      </Flex>
                    }
                  />
                )}
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {summary?.iqc && (
        <Card
          title="IQC 品質統計"
          extra={<Text type="secondary">依 IQC 檢驗紀錄彙總</Text>}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="IQC 紀錄總數" value={summary.iqc.total} precision={0} groupSeparator="," />
                <Text type="secondary" style={{ fontSize: 12 }}>IQC 檢驗紀錄總筆數</Text>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="待審核" value={summary.iqc.pending_review} precision={0} groupSeparator="," />
                <Text type="secondary" style={{ fontSize: 12 }}>review_status = pending</Text>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="合格" value={summary.iqc.passed} precision={0} groupSeparator="," />
                <Text type="secondary" style={{ fontSize: 12 }}>inspection_result = passed</Text>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="不合格" value={summary.iqc.failed} precision={0} groupSeparator="," />
                <Text type="secondary" style={{ fontSize: 12 }}>inspection_result = failed</Text>
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      {summary?.nonconformances && (
        <Card
          title="不合格案件統計"
          extra={<Text type="secondary">依不合格案件狀態彙總</Text>}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="不合格案件總數" value={summary.nonconformances.total} precision={0} groupSeparator="," />
                <Text type="secondary" style={{ fontSize: 12 }}>案件總筆數</Text>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="未結案" value={summary.nonconformances.open} precision={0} groupSeparator="," />
                <Text type="secondary" style={{ fontSize: 12 }}>status 非 closed</Text>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="已結案" value={summary.nonconformances.closed} precision={0} groupSeparator="," />
                <Text type="secondary" style={{ fontSize: 12 }}>status = closed</Text>
              </Card>
            </Col>
          </Row>
        </Card>
      )}
    </>
  );
}