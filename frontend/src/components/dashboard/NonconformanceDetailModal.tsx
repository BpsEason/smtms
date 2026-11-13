import type { CSSProperties } from "react";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Flex,
  List,
  Modal,
  Space,
  Spin,
  Statistic,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { PaperClipOutlined } from "@ant-design/icons";
import { SeverityBadge, StatusBadge } from "../ui";
import type { Nonconformance, OpenNCItem } from "../../types";
import { formatErrorMessage } from "../../lib/error";
import {
  EMPTY_TEXT,
  formatFileSize,
  formatHistoryPayload,
  formatParty,
  formatTaiwanDateTime,
} from "./format";
import { LONG_TEXT_STYLE, SummaryItem } from "./shared";

const { Text } = Typography;

const DIFF_PRE_STYLE: CSSProperties = {
  margin: 0,
  padding: 8,
  maxHeight: 160,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  background: "#fafafa",
  borderRadius: 4,
};

function describeAttachment(attachment: NonNullable<Nonconformance["attachments"]>[number]): string {
  const parts = [attachment.media_type || "未知類型", formatFileSize(attachment.size_bytes)];
  if (attachment.created_at) {
    parts.push(formatTaiwanDateTime(attachment.created_at));
  }
  return parts.join(" · ");
}

type NonconformanceDetailModalProps = {
  open: boolean;
  item: OpenNCItem | null;
  detail: Nonconformance | undefined;
  loading: boolean;
  error: Error | null;
  attachmentError: string | null;
  onClose: () => void;
  onRetry: () => void;
  onDownloadAttachment: (caseId: number, attachmentId: number, filename: string) => void;
};

export function NonconformanceDetailModal({
  open,
  item,
  detail,
  loading,
  error,
  attachmentError,
  onClose,
  onRetry,
  onDownloadAttachment,
}: NonconformanceDetailModalProps) {
  const supplierText =
    formatParty(item?.supplier_name, item?.supplier_code) ??
    (detail?.supplier_id ? `供應商 #${detail.supplier_id}` : EMPTY_TEXT);
  const materialText =
    formatParty(item?.material_name, item?.material_code) ??
    (detail?.material_id ? `物料 #${detail.material_id}` : EMPTY_TEXT);
  const ownerText = detail?.owner_user_id
    ? `使用者 #${detail.owner_user_id}`
    : EMPTY_TEXT;
  const dispositions = detail?.dispositions ?? [];
  const history = detail?.history ?? [];
  const attachments = detail?.attachments ?? [];

  return (
    <Modal
      title="不合格案件詳細資料"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="back" onClick={onClose}>
          關閉
        </Button>,
      ]}
      width="min(1000px, 94vw)"
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
          message="不合格案件詳細資料讀取失敗"
          description={formatErrorMessage(error)}
          action={<Button size="small" onClick={onRetry}>重試</Button>}
        />
      ) : !detail ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Flex vertical gap={4} align="center">
              <Text strong>找不到不合格案件資料</Text>
              <Text type="secondary">請重新整理後再試一次。</Text>
            </Flex>
          }
        />
      ) : (
        <Flex vertical gap={16} style={{ width: "100%" }}>
          <Card
            size="small"
            title={
              <Flex align="center" gap={8} wrap="wrap">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  案件編號
                </Text>
                <Text strong>{detail.case_no}</Text>
              </Flex>
            }
            extra={
              <Space wrap size={8}>
                <StatusBadge value={detail.status} />
                <SeverityBadge value={detail.severity} />
                <Tag>來源：{detail.source}</Tag>
              </Space>
            }
          >
            <Flex wrap="wrap" align="flex-start" gap={32}>
              <Flex vertical gap={2} style={{ minWidth: 0, flex: "1 1 260px" }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  案件標題
                </Text>
                <Text strong style={{ fontSize: 16 }}>
                  {detail.title}
                </Text>
              </Flex>
              <Statistic
                title="不良數量"
                value={detail.defect_qty !== null ? Number(detail.defect_qty) : EMPTY_TEXT}
              />
              <SummaryItem label="發現時間">
                <Text>{formatTaiwanDateTime(detail.found_at)}</Text>
              </SummaryItem>
              <SummaryItem label="負責人">
                <Text>{ownerText}</Text>
              </SummaryItem>
            </Flex>
          </Card>

          <Card size="small" title="關聯資料">
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: "supplier", label: "供應商", children: supplierText },
                { key: "material", label: "物料", children: materialText },
                {
                  key: "receipt",
                  label: "收料紀錄",
                  children: detail.receipt_id
                    ? `收料單 #${detail.receipt_id}`
                    : EMPTY_TEXT,
                },
                {
                  key: "supplier_lot",
                  label: "供應商批號",
                  children: detail.supplier_lot_id
                    ? `供應商批號 #${detail.supplier_lot_id}`
                    : EMPTY_TEXT,
                },
                {
                  key: "internal_lot",
                  label: "內部批號",
                  children: detail.internal_lot_id
                    ? `內部批號 #${detail.internal_lot_id}`
                    : EMPTY_TEXT,
                },
                {
                  key: "iqc_record",
                  label: "IQC 檢驗紀錄",
                  children: detail.iqc_record_id
                    ? `IQC-${detail.iqc_record_id}`
                    : EMPTY_TEXT,
                },
                {
                  key: "found_at",
                  label: "發現時間",
                  children: formatTaiwanDateTime(detail.found_at),
                },
                { key: "owner", label: "負責人", children: ownerText },
              ]}
            />
          </Card>

          <Card size="small" title="異常描述">
            <Text style={LONG_TEXT_STYLE}>{detail.description || EMPTY_TEXT}</Text>
          </Card>

          <Card size="small" title="調查內容">
            {detail.investigation?.trim() ? (
              <Text style={LONG_TEXT_STYLE}>{detail.investigation}</Text>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="尚無調查內容"
              />
            )}
          </Card>

          <Card size="small" title="圍堵與處置紀錄">
            {dispositions.length > 0 ? (
              <Timeline
                items={dispositions.map((disposition, index) => ({
                  color: index % 2 === 0 ? "blue" : "green",
                  children: (
                    <Flex vertical gap={4}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatTaiwanDateTime(disposition.executed_at)} · 負責人 ID{" "}
                        {disposition.owner_user_id}
                      </Text>
                      <Text strong>{disposition.content}</Text>
                      <Text>處置結果：{disposition.result}</Text>
                    </Flex>
                  ),
                }))}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="尚無圍堵與處置紀錄"
              />
            )}
          </Card>

          <Card size="small" title="附件">
            {attachmentError && (
              <Alert
                type="error"
                showIcon
                message="附件下載失敗"
                description={attachmentError}
                style={{ marginBottom: 12 }}
              />
            )}
            <List
              dataSource={attachments}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="尚無附件"
                  />
                ),
              }}
              renderItem={(attachment) => (
                <List.Item
                  actions={[
                    <Button
                      key="download"
                      type="link"
                      size="small"
                      onClick={() =>
                        onDownloadAttachment(
                          detail.id,
                          attachment.id,
                          attachment.original_filename,
                        )
                      }
                    >
                      下載
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <PaperClipOutlined style={{ fontSize: 18, color: "#8c8c8c" }} />
                    }
                    title={attachment.original_filename}
                    description={describeAttachment(attachment)}
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card size="small" title="案件歷程">
            {history.length > 0 ? (
              <Timeline
                items={history.map((entry) => {
                  const beforeText = formatHistoryPayload(entry.before_data);
                  const afterText = formatHistoryPayload(entry.after_data);
                  const hasDiff = beforeText !== EMPTY_TEXT || afterText !== EMPTY_TEXT;
                  return {
                    children: (
                      <Flex vertical gap={4}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatTaiwanDateTime(entry.created_at)} · 操作者 ID{" "}
                          {entry.actor_user_id}
                        </Text>
                        <Text strong>{entry.action}</Text>
                        {hasDiff && (
                          <Collapse
                            size="small"
                            ghost
                            items={[
                              {
                                key: "before",
                                label: "異動前",
                                children: <pre style={DIFF_PRE_STYLE}>{beforeText}</pre>,
                              },
                              {
                                key: "after",
                                label: "異動後",
                                children: <pre style={DIFF_PRE_STYLE}>{afterText}</pre>,
                              },
                            ]}
                          />
                        )}
                      </Flex>
                    ),
                  };
                })}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="尚無案件歷程"
              />
            )}
          </Card>
        </Flex>
      )}
    </Modal>
  );
}