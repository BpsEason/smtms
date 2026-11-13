import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Empty,
  Spin,
  Alert,
  Button,
  Typography,
  Space,
  Flex,
  Divider,
  Modal,
  Descriptions,
  Timeline,
  List,
  Collapse,
  Progress,
} from "antd";
import {
  InboxOutlined,
  NumberOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { ApiError, api } from "../api";
import { formatErrorMessage } from "../lib/error";
import { QualityTrendChart } from "../components/QualityTrendChart";
import { SeverityBadge, StatusBadge } from "../components/ui";
import type {
  DashboardSummary,
  DashboardTodos,
  OpenNCItem,
  PaginatedResponse,
  PendingIQCItem,
  QualityTrendResponse,
  Receipt,
  UserProfile,
  IQCRecord,
  Nonconformance,
} from "../types";

const { Title, Text } = Typography;

const EMPTY_TEXT = "—";

const taiwanDateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const taiwanDateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function formatTaiwanDate(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_TEXT;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return EMPTY_TEXT;
  }
  return taiwanDateFormatter.format(date);
}

function formatTaiwanDateTime(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_TEXT;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return EMPTY_TEXT;
  }
  return taiwanDateTimeFormatter.format(date);
}

function formatParty(
  name: string | null | undefined,
  code: string | null | undefined,
): string | null {
  if (name && code) {
    return `${name} (${code})`;
  }
  return name ?? code ?? null;
}

function formatHistoryPayload(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return EMPTY_TEXT;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return EMPTY_TEXT;
    }
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return EMPTY_TEXT;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

const LONG_TEXT_STYLE: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

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

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Flex vertical gap={4}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
      <div>{children}</div>
    </Flex>
  );
}

function describeAttachment(attachment: NonNullable<Nonconformance["attachments"]>[number]): string {
  const parts = [attachment.media_type || "未知類型", formatFileSize(attachment.size_bytes)];
  if (attachment.created_at) {
    parts.push(formatTaiwanDateTime(attachment.created_at));
  }
  return parts.join(" · ");
}

const IQC_SUMMARY_PERMISSIONS = [
  "iqc:read",
  "quality:review",
  "quality:approve",
  "quality:return",
];

function getStatusColor(status: string): "success" | "warning" | "error" | "processing" | "default" {
  const normalized = status.toLowerCase();
  if (["active", "available", "passed", "released", "approved", "complete", "completed", "closed"].includes(normalized)) {
    return "success";
  }
  if (["pending", "hold", "quarantine", "received", "in_progress", "pending_confirmation"].includes(normalized)) {
    return "warning";
  }
  if (["failed", "rejected", "inactive", "blocked", "returned"].includes(normalized)) {
    return "error";
  }
  if (normalized === "investigating") {
    return "processing";
  }
  return "default";
}

function getSeverityColor(severity: string): "red" | "orange" | "gold" | "green" | "default" {
  const normalized = severity.toLowerCase();
  if (normalized === "critical") return "red";
  if (normalized === "high") return "orange";
  if (normalized === "medium") return "gold";
  if (normalized === "low") return "green";
  return "default";
}

export function DashboardPage({ profile }: { profile: UserProfile | null }) {
  const can = useCallback(
    (permission: string) => Boolean(profile?.permissions.includes(permission)),
    [profile],
  );
  const canAny = useCallback(
    (permissions: string[]) => permissions.some((permission) => can(permission)),
    [can],
  );

  const canReadReceipts = can("receipts:read");
  const canReadMaterials = can("materials:read");
  const canReadIQCSummary = canAny(IQC_SUMMARY_PERMISSIONS);
  const canReadNonconformances = can("nonconformance:read");
  const canReadQualityTrend = canReadIQCSummary;
  const canReadDashboardSummary =
    canReadReceipts || canReadMaterials || canReadIQCSummary || canReadNonconformances;
  const canReadTodos = canReadIQCSummary || canReadNonconformances;

  const receiptsQuery = useQuery<PaginatedResponse<Receipt>>({
    queryKey: ["dashboard", "receipts", "recent"],
    queryFn: () => api.listReceipts({ page: 1, page_size: 8 }),
    enabled: canReadReceipts,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const summaryQuery = useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: () => api.getDashboardSummary(),
    enabled: canReadDashboardSummary,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const todosQuery = useQuery<DashboardTodos>({
    queryKey: ["dashboard", "todos"],
    queryFn: () => api.getDashboardTodos(),
    enabled: canReadTodos,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const trendQuery = useQuery<QualityTrendResponse>({
    queryKey: ["dashboard", "quality-trend"],
    queryFn: () => api.getQualityTrend(),
    enabled: canReadQualityTrend,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const [selectedIqc, setSelectedIqc] = useState<PendingIQCItem | null>(null);
  const [iqcDetailModalOpen, setIqcDetailModalOpen] = useState(false);

  const iqcDetailQuery = useQuery<IQCRecord>({
    queryKey: ["iqc", "detail", selectedIqc?.id],
    queryFn: () => api.getIQCRecord(selectedIqc!.id),
    enabled: !!selectedIqc,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const handleOpenIqcDetail = (item: PendingIQCItem) => {
    setSelectedIqc(item);
    setIqcDetailModalOpen(true);
  };

  const handleCloseIqcDetail = () => {
    setIqcDetailModalOpen(false);
    setSelectedIqc(null);
  };

  const [selectedNc, setSelectedNc] = useState<OpenNCItem | null>(null);
  const [ncDetailModalOpen, setNcDetailModalOpen] = useState(false);
  const [ncAttachmentError, setNcAttachmentError] = useState<string | null>(null);

  const ncDetailQuery = useQuery<Nonconformance>({
    queryKey: ["nonconformance", "detail", selectedNc?.id],
    queryFn: () => api.getNonconformance(selectedNc!.id),
    enabled: !!selectedNc,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const handleOpenNcDetail = (item: OpenNCItem) => {
    setSelectedNc(item);
    setNcAttachmentError(null);
    setNcDetailModalOpen(true);
  };

  const handleCloseNcDetail = () => {
    setNcDetailModalOpen(false);
    setSelectedNc(null);
    setNcAttachmentError(null);
  };

  const handleDownloadAttachment = async (
    caseId: number,
    attachmentId: number,
    filename: string,
  ) => {
    setNcAttachmentError(null);
    try {
      const blob = await api.downloadNonconformanceAttachment(caseId, attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNcAttachmentError(formatErrorMessage(error));
    }
  };

  const handleRefresh = () => {
    const tasks: Array<Promise<unknown>> = [];
    if (canReadReceipts) tasks.push(receiptsQuery.refetch());
    if (canReadDashboardSummary) tasks.push(summaryQuery.refetch());
    if (canReadTodos) tasks.push(todosQuery.refetch());
    if (canReadQualityTrend) tasks.push(trendQuery.refetch());
    void Promise.all(tasks);
  };

  const summary = summaryQuery.data;
  const todos = todosQuery.data;
  const trend = trendQuery.data ?? [];
  const summaryForbidden =
    summaryQuery.error instanceof ApiError && summaryQuery.error.status === 403;
  const summaryError = summaryQuery.error && !summaryForbidden ? summaryQuery.error : null;
  const todosForbidden =
    todosQuery.error instanceof ApiError && todosQuery.error.status === 403;
  const todosError = todosQuery.error && !todosForbidden ? todosQuery.error : null;
  const trendForbidden =
    trendQuery.error instanceof ApiError && trendQuery.error.status === 403;
  const trendError = trendQuery.error && !trendForbidden ? trendQuery.error : null;

  const loading =
    (canReadReceipts && receiptsQuery.isLoading) ||
    (canReadDashboardSummary && summaryQuery.isLoading) ||
    (canReadTodos && todosQuery.isLoading) ||
    (canReadQualityTrend && trendQuery.isLoading);
  const refreshing =
    (canReadReceipts && receiptsQuery.isFetching) ||
    (canReadDashboardSummary && summaryQuery.isFetching) ||
    (canReadTodos && todosQuery.isFetching) ||
    (canReadQualityTrend && trendQuery.isFetching);

  const errors: Array<{ key: string; message: string; onRetry?: () => void }> = [];
  if (summaryError) {
    errors.push({
      key: "summary",
      message: `儀表板統計：${formatErrorMessage(summaryError)}`,
      onRetry: () => void summaryQuery.refetch(),
    });
  }
  if (todosError) {
    errors.push({
      key: "todos",
      message: `待辦清單：${formatErrorMessage(todosError)}`,
      onRetry: () => void todosQuery.refetch(),
    });
  }
  if (trendError) {
    errors.push({
      key: "quality-trend",
      message: `品質趨勢：${formatErrorMessage(trendError)}`,
      onRetry: () => void trendQuery.refetch(),
    });
  }
  if (receiptsQuery.error) {
    errors.push({
      key: "receipts",
      message: `收料紀錄：${formatErrorMessage(receiptsQuery.error)}`,
      onRetry: () => void receiptsQuery.refetch(),
    });
  }

  const lotStatusEntries = summary?.internal_lots
    ? Object.entries(summary.internal_lots.by_lot_status)
    : [];
  const lotStatusTotal = lotStatusEntries.reduce(
    (sum, [, count]) => sum + (Number.isFinite(count) ? count : 0),
    0,
  );
  const hasVisibleSummaryBlocks = Boolean(
    summary?.receipts ||
      summary?.internal_lots ||
      summary?.iqc ||
      summary?.nonconformances,
  );

  const showNoDataPanel =
    !loading &&
    !canReadReceipts &&
    (!canReadDashboardSummary || summaryForbidden || (!summaryQuery.isLoading && !hasVisibleSummaryBlocks));

  const iqcDetail = iqcDetailQuery.data;
  const iqcSupplierText =
    formatParty(selectedIqc?.supplier_name, selectedIqc?.supplier_code) ?? EMPTY_TEXT;
  const iqcMaterialText =
    formatParty(selectedIqc?.material_name, selectedIqc?.material_code) ?? EMPTY_TEXT;
  const iqcReceiptNo =
    selectedIqc?.receipt_no ??
    (iqcDetail?.receipt_id ? `收料單 #${iqcDetail.receipt_id}` : EMPTY_TEXT);
  const iqcInternalLotNo =
    iqcDetail?.internal_lot_no ??
    selectedIqc?.internal_lot_no ??
    (iqcDetail?.internal_lot_id ? `內部批號 #${iqcDetail.internal_lot_id}` : EMPTY_TEXT);
  const iqcHasReviewInfo = Boolean(
    iqcDetail?.reviewed_at || iqcDetail?.reviewed_by_user_id || iqcDetail?.review_decision_note,
  );

  const ncDetail = ncDetailQuery.data;
  const ncSupplierText =
    formatParty(selectedNc?.supplier_name, selectedNc?.supplier_code) ??
    (ncDetail?.supplier_id ? `供應商 #${ncDetail.supplier_id}` : EMPTY_TEXT);
  const ncMaterialText =
    formatParty(selectedNc?.material_name, selectedNc?.material_code) ??
    (ncDetail?.material_id ? `物料 #${ncDetail.material_id}` : EMPTY_TEXT);
  const ncOwnerText = ncDetail?.owner_user_id
    ? `使用者 #${ncDetail.owner_user_id}`
    : EMPTY_TEXT;
  const ncDispositions = ncDetail?.dispositions ?? [];
  const ncHistory = ncDetail?.history ?? [];
  const ncAttachments = ncDetail?.attachments ?? [];

  return (
    <section>
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
          onClick={handleRefresh}
          disabled={loading || refreshing}
          icon={refreshing ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
        >
          重新整理
        </Button>
      </Flex>

      {loading && (
        <Flex role="status" align="center" gap={8} style={{ padding: "32px 0" }}>
          <Spin size="small" />
          <Text>正在載入儀表板資料…</Text>
        </Flex>
      )}

      {errors.length > 0 && (
        <Space orientation="vertical" size="middle" style={{ width: "100%", marginBottom: 20 }}>
          {errors.map((error) => (
            <Alert
              key={error.key}
              type="error"
              showIcon
              message={error.message}
              action={error.onRetry ? <Button size="small" onClick={error.onRetry}>重試</Button> : undefined}
            />
          ))}
        </Space>
      )}

      {summaryForbidden && (
        <Card
          title="無法讀取統計資料"
          extra={<Text type="secondary">目前帳號沒有儀表板統計的讀取權限</Text>}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Flex vertical gap={4} align="center">
                <Text strong>沒有可讀取的儀表板統計</Text>
                <Text type="secondary">請洽系統管理員確認收料、物料、IQC 或不合格案件的讀取權限。</Text>
              </Flex>
            }
          />
        </Card>
      )}

      {!loading && !summaryForbidden && hasVisibleSummaryBlocks && (
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
      )}

      {canReadQualityTrend && !trendForbidden && (
        <Card
          title="品質趨勢"
          extra={<Text type="secondary">依 IQC 檢驗日期彙總每月檢驗量與合格率</Text>}
          style={{ marginBottom: 24 }}
        >
          {trendQuery.isLoading ? (
            <Flex align="center" style={{ padding: "60px 0" }}>
              <Spin size="large" />
            </Flex>
          ) : trendError ? (
            <Alert type="error" showIcon message="品質趨勢讀取失敗" description="請重試品質趨勢查詢。" />
          ) : trend.length === 0 ? (
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
            <QualityTrendChart data={trend} />
          )}
        </Card>
      )}

      {canReadTodos && !todosForbidden && (
        <>
          {todos?.pending_iqc && todos.pending_iqc.length > 0 && (
            <Card
              title="待審核 IQC"
              extra={<Text type="secondary">IQC 檢驗紀錄中 review_status = pending 的項目</Text>}
              style={{ marginBottom: 24 }}
            >
              {todosQuery.isLoading ? (
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
                      render: (_, record: typeof todos.pending_iqc[0]) =>
                        record.supplier_name
                          ? `${record.supplier_name} (${record.supplier_code})`
                          : record.supplier_code ?? "—",
                    },
                    {
                      title: "物料",
                      key: "material",
                      render: (_, record: typeof todos.pending_iqc[0]) =>
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
                      render: (_, record: typeof todos.pending_iqc[0]) => (
                        <Button
                          type="link"
                          size="small"
                          onClick={() => handleOpenIqcDetail(record)}
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
              {todosQuery.isLoading ? (
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
                      render: (_, record: typeof todos.open_nc[0]) =>
                        record.supplier_name
                          ? `${record.supplier_name} (${record.supplier_code})`
                          : record.supplier_code ?? "—",
                    },
                    {
                      title: "物料",
                      key: "material",
                      render: (_, record: typeof todos.open_nc[0]) =>
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
                      render: (_, record: typeof todos.open_nc[0]) => (
                        <Button
                          type="link"
                          size="small"
                          onClick={() => handleOpenNcDetail(record)}
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

          {!todosQuery.isLoading && !todos?.pending_iqc?.length && !todos?.open_nc?.length && (
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
      )}

      {showNoDataPanel && (
        <Card
          title="無法讀取資料"
          extra={<Text type="secondary">目前帳號沒有可顯示的儀表板區塊或收料資料權限</Text>}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Flex vertical gap={4} align="center">
                <Text strong>沒有可讀取的儀表板資料</Text>
                <Text type="secondary">請洽系統管理員確認相關讀取權限。</Text>
              </Flex>
            }
          />
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        {canReadReceipts && (
          <Col xs={24} lg={16}>
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
              {receiptsQuery.isLoading ? (
                <Flex align="center" style={{ padding: "40px 0" }}>
                  <Spin />
                </Flex>
              ) : receiptsQuery.data?.items.length ? (
                <Table
                  dataSource={receiptsQuery.data.items.slice(0, 6)}
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
              ) : receiptsQuery.error ? (
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
          </Col>
        )}

        <Col xs={24} lg={8}>
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
            ) : !loading && summaryQuery.error ? (
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
        </Col>
      </Row>

      <Text type="secondary" style={{ marginTop: 20, fontSize: 12 }}>
        儀表板統計來源為後端彙總 API；未提供之指標不於前端推算。
      </Text>

      <Modal
        title="IQC 檢驗詳細資料"
        open={iqcDetailModalOpen}
        onCancel={handleCloseIqcDetail}
        footer={[
          <Button key="back" onClick={handleCloseIqcDetail}>
            關閉
          </Button>,
        ]}
        width="min(800px, 92vw)"
        destroyOnHidden
        styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      >
        {iqcDetailQuery.isLoading ? (
          <Flex align="center" justify="center" style={{ padding: "48px 0" }}>
            <Spin size="large" />
          </Flex>
        ) : iqcDetailQuery.error ? (
          <Alert
            type="error"
            showIcon
            message="IQC 詳細資料讀取失敗"
            description={formatErrorMessage(iqcDetailQuery.error)}
            action={<Button size="small" onClick={() => void iqcDetailQuery.refetch()}>重試</Button>}
          />
        ) : !iqcDetail ? (
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
                    IQC-{iqcDetail.id}
                  </Title>
                </Flex>
                <Flex wrap="wrap" gap={24}>
                  <SummaryItem label="檢驗結果">
                    <StatusBadge value={iqcDetail.inspection_result} />
                  </SummaryItem>
                  <SummaryItem label="審核狀態">
                    <StatusBadge value={iqcDetail.review_status || "pending"} />
                  </SummaryItem>
                  <SummaryItem label="放行狀態">
                    <StatusBadge value={iqcDetail.release_status} />
                  </SummaryItem>
                </Flex>
              </Flex>
            </Card>

            <Card size="small" title="基本資料">
              <Descriptions
                size="small"
                column={{ xs: 1, sm: 2 }}
                items={[
                  { key: "id", label: "IQC 編號", children: `IQC-${iqcDetail.id}` },
                  { key: "receipt_no", label: "收料單號", children: iqcReceiptNo },
                  { key: "supplier", label: "供應商", children: iqcSupplierText },
                  { key: "material", label: "物料", children: iqcMaterialText },
                  {
                    key: "supplier_lot_no",
                    label: "供應商批號",
                    children: (
                      <Text type="secondary" title="IQC 詳細資料 API 未提供供應商批號欄位">
                        {EMPTY_TEXT}
                      </Text>
                    ),
                  },
                  { key: "internal_lot_no", label: "內部批號", children: iqcInternalLotNo },
                  {
                    key: "inspection_date",
                    label: "檢驗日期",
                    children: formatTaiwanDate(iqcDetail.inspection_date),
                  },
                  {
                    key: "created_at",
                    label: "建立時間",
                    children: formatTaiwanDateTime(iqcDetail.created_at),
                  },
                ]}
              />
            </Card>

            <Card size="small" title="檢驗結果">
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="抽樣數量"
                    value={Number(iqcDetail.sample_qty)}
                    groupSeparator=","
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="檢驗結果"
                    value={iqcDetail.inspection_result}
                    valueRender={() => <StatusBadge value={iqcDetail.inspection_result} />}
                  />
                </Col>
              </Row>
              {iqcHasReviewInfo && (
                <>
                  <Divider style={{ margin: "16px 0" }} />
                  <Descriptions
                    size="small"
                    column={{ xs: 1, sm: 2 }}
                    items={[
                      {
                        key: "reviewed_by_user_id",
                        label: "審核人員",
                        children: iqcDetail.reviewed_by_user_id
                          ? `使用者 #${iqcDetail.reviewed_by_user_id}`
                          : EMPTY_TEXT,
                      },
                      {
                        key: "reviewed_at",
                        label: "審核時間",
                        children: formatTaiwanDateTime(iqcDetail.reviewed_at),
                      },
                      {
                        key: "review_decision_note",
                        label: "審核結論",
                        span: 2,
                        children: iqcDetail.review_decision_note ?? EMPTY_TEXT,
                      },
                    ]}
                  />
                </>
              )}
            </Card>

            <Card size="small" title="檢驗備註">
              {iqcDetail.remarks?.trim() ? (
                <Text style={LONG_TEXT_STYLE}>{iqcDetail.remarks}</Text>
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

      <Modal
        title="不合格案件詳細資料"
        open={ncDetailModalOpen}
        onCancel={handleCloseNcDetail}
        footer={[
          <Button key="back" onClick={handleCloseNcDetail}>
            關閉
          </Button>,
        ]}
        width="min(1000px, 94vw)"
        destroyOnHidden
        styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      >
        {ncDetailQuery.isLoading ? (
          <Flex align="center" justify="center" style={{ padding: "48px 0" }}>
            <Spin size="large" />
          </Flex>
        ) : ncDetailQuery.error ? (
          <Alert
            type="error"
            showIcon
            message="不合格案件詳細資料讀取失敗"
            description={formatErrorMessage(ncDetailQuery.error)}
            action={<Button size="small" onClick={() => void ncDetailQuery.refetch()}>重試</Button>}
          />
        ) : !ncDetail ? (
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
                  <Text strong>{ncDetail.case_no}</Text>
                </Flex>
              }
              extra={
                <Space wrap size={8}>
                  <StatusBadge value={ncDetail.status} />
                  <SeverityBadge value={ncDetail.severity} />
                  <Tag>來源：{ncDetail.source}</Tag>
                </Space>
              }
            >
              <Flex wrap="wrap" align="flex-start" gap={32}>
                <Flex vertical gap={2} style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    案件標題
                  </Text>
                  <Text strong style={{ fontSize: 16 }}>
                    {ncDetail.title}
                  </Text>
                </Flex>
                <Statistic
                  title="不良數量"
                  value={ncDetail.defect_qty !== null ? Number(ncDetail.defect_qty) : EMPTY_TEXT}
                />
                <SummaryItem label="發現時間">
                  <Text>{formatTaiwanDateTime(ncDetail.found_at)}</Text>
                </SummaryItem>
                <SummaryItem label="負責人">
                  <Text>{ncOwnerText}</Text>
                </SummaryItem>
              </Flex>
            </Card>

            <Card size="small" title="關聯資料">
              <Descriptions
                size="small"
                column={{ xs: 1, sm: 2 }}
                items={[
                  { key: "supplier", label: "供應商", children: ncSupplierText },
                  { key: "material", label: "物料", children: ncMaterialText },
                  {
                    key: "receipt",
                    label: "收料紀錄",
                    children: ncDetail.receipt_id
                      ? `收料單 #${ncDetail.receipt_id}`
                      : EMPTY_TEXT,
                  },
                  {
                    key: "supplier_lot",
                    label: "供應商批號",
                    children: ncDetail.supplier_lot_id
                      ? `供應商批號 #${ncDetail.supplier_lot_id}`
                      : EMPTY_TEXT,
                  },
                  {
                    key: "internal_lot",
                    label: "內部批號",
                    children: ncDetail.internal_lot_id
                      ? `內部批號 #${ncDetail.internal_lot_id}`
                      : EMPTY_TEXT,
                  },
                  {
                    key: "iqc_record",
                    label: "IQC 檢驗紀錄",
                    children: ncDetail.iqc_record_id
                      ? `IQC-${ncDetail.iqc_record_id}`
                      : EMPTY_TEXT,
                  },
                  {
                    key: "found_at",
                    label: "發現時間",
                    children: formatTaiwanDateTime(ncDetail.found_at),
                  },
                  { key: "owner", label: "負責人", children: ncOwnerText },
                ]}
              />
            </Card>

            <Card size="small" title="異常描述">
              <Text style={LONG_TEXT_STYLE}>{ncDetail.description || EMPTY_TEXT}</Text>
            </Card>

            <Card size="small" title="調查內容">
              {ncDetail.investigation?.trim() ? (
                <Text style={LONG_TEXT_STYLE}>{ncDetail.investigation}</Text>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="尚無調查內容"
                />
              )}
            </Card>

            <Card size="small" title="圍堵與處置紀錄">
              {ncDispositions.length > 0 ? (
                <Timeline
                  items={ncDispositions.map((disposition, index) => ({
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
              {ncAttachmentError && (
                <Alert
                  type="error"
                  showIcon
                  message="附件下載失敗"
                  description={ncAttachmentError}
                  style={{ marginBottom: 12 }}
                />
              )}
              <List
                dataSource={ncAttachments}
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
                          void handleDownloadAttachment(
                            ncDetail.id,
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
              {ncHistory.length > 0 ? (
                <Timeline
                  items={ncHistory.map((entry) => {
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
    </section>
  );
}