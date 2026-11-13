import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Flex,
  Modal,
  Row,
  Spin,
  Statistic,
  Typography,
} from "antd";
import { StatusBadge } from "../ui";
import type { IQCRecord, PendingIQCItem } from "../../types";
import { formatErrorMessage } from "../../lib/error";
import { EMPTY_TEXT, formatParty, formatTaiwanDate, formatTaiwanDateTime } from "./format";
import { LONG_TEXT_STYLE, SummaryItem } from "./shared";

const { Title, Text } = Typography;

type IqcDetailModalProps = {
  open: boolean;
  item: PendingIQCItem | null;
  detail: IQCRecord | undefined;
  loading: boolean;
  error: Error | null;
  onClose: () => void;
  onRetry: () => void;
};

export function IqcDetailModal({
  open,
  item,
  detail,
  loading,
  error,
  onClose,
  onRetry,
}: IqcDetailModalProps) {
  const supplierText = formatParty(item?.supplier_name, item?.supplier_code) ?? EMPTY_TEXT;
  const materialText = formatParty(item?.material_name, item?.material_code) ?? EMPTY_TEXT;
  const receiptNo =
    item?.receipt_no ??
    (detail?.receipt_id ? `收料單 #${detail.receipt_id}` : EMPTY_TEXT);
  const internalLotNo =
    detail?.internal_lot_no ??
    item?.internal_lot_no ??
    (detail?.internal_lot_id ? `內部批號 #${detail.internal_lot_id}` : EMPTY_TEXT);
  const hasReviewInfo = Boolean(
    detail?.reviewed_at || detail?.reviewed_by_user_id || detail?.review_decision_note,
  );

  return (
    <Modal
      title="IQC 檢驗詳細資料"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="back" onClick={onClose}>
          關閉
        </Button>,
      ]}
      width="min(800px, 92vw)"
      destroyOnHidden
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
    >
      {loading ? (
        <Flex align="center" justify="center" style={{ padding: "48px 0" }}>
          <Spin size="large" />
        </Flex>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message="IQC 詳細資料讀取失敗"
          description={formatErrorMessage(error)}
          action={<Button size="small" onClick={onRetry}>重試</Button>}
        />
      ) : !detail ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Flex vertical gap={4} align="center">
              <Text strong>找不到 IQC 資料</Text>
              <Text type="secondary">請重新整理後再試一次。</Text>
            </Flex>
          }
        />
      ) : (
        <Flex vertical gap={16} style={{ width: "100%" }}>
          <Card size="small" title="檢驗摘要">
            <Flex wrap="wrap" align="flex-start" justify="space-between" gap={16}>
              <Flex vertical gap={2}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  IQC 編號
                </Text>
                <Title level={3} style={{ margin: 0 }}>
                  IQC-{detail.id}
                </Title>
              </Flex>
              <Flex wrap="wrap" gap={24}>
                <SummaryItem label="檢驗結果">
                  <StatusBadge value={detail.inspection_result} />
                </SummaryItem>
                <SummaryItem label="審核狀態">
                  <StatusBadge value={detail.review_status || "pending"} />
                </SummaryItem>
                <SummaryItem label="放行狀態">
                  <StatusBadge value={detail.release_status} />
                </SummaryItem>
              </Flex>
            </Flex>
          </Card>

          <Card size="small" title="基本資料">
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: "id", label: "IQC 編號", children: `IQC-${detail.id}` },
                { key: "receipt_no", label: "收料單號", children: receiptNo },
                { key: "supplier", label: "供應商", children: supplierText },
                { key: "material", label: "物料", children: materialText },
                {
                  key: "supplier_lot_no",
                  label: "供應商批號",
                  children: (
                    <Text type="secondary" title="IQC 詳細資料 API 未提供供應商批號欄位">
                      {EMPTY_TEXT}
                    </Text>
                  ),
                },
                { key: "internal_lot_no", label: "內部批號", children: internalLotNo },
                {
                  key: "inspection_date",
                  label: "檢驗日期",
                  children: formatTaiwanDate(detail.inspection_date),
                },
                {
                  key: "created_at",
                  label: "建立時間",
                  children: formatTaiwanDateTime(detail.created_at),
                },
              ]}
            />
          </Card>

          <Card size="small" title="檢驗結果">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Statistic
                  title="抽樣數量"
                  value={Number(detail.sample_qty)}
                  groupSeparator=","
                />
              </Col>
              <Col xs={24} sm={12}>
                <Statistic
                  title="檢驗結果"
                  value={detail.inspection_result}
                  valueRender={() => <StatusBadge value={detail.inspection_result} />}
                />
              </Col>
            </Row>
            {hasReviewInfo && (
              <>
                <Divider style={{ margin: "16px 0" }} />
                <Descriptions
                  size="small"
                  column={{ xs: 1, sm: 2 }}
                  items={[
                    {
                      key: "reviewed_by_user_id",
                      label: "審核人員",
                      children: detail.reviewed_by_user_id
                        ? `使用者 #${detail.reviewed_by_user_id}`
                        : EMPTY_TEXT,
                    },
                    {
                      key: "reviewed_at",
                      label: "審核時間",
                      children: formatTaiwanDateTime(detail.reviewed_at),
                    },
                    {
                      key: "review_decision_note",
                      label: "審核結論",
                      span: 2,
                      children: detail.review_decision_note ?? EMPTY_TEXT,
                    },
                  ]}
                />
              </>
            )}
          </Card>

          <Card size="small" title="檢驗備註">
            {detail.remarks?.trim() ? (
              <Text style={LONG_TEXT_STYLE}>{detail.remarks}</Text>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="尚無檢驗備註"
              />
            )}
          </Card>
        </Flex>
      )}
    </Modal>
  );
}