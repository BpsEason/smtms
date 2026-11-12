import { useCallback, useState } from "react";
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
} from "antd";
import {
  InboxOutlined,
  NumberOutlined,
} from "@ant-design/icons";
import { ApiError, api } from "../api";
import { formatErrorMessage } from "../lib/error";
import { QualityTrendChart } from "../components/QualityTrendChart";
import { SeverityBadge, StatusBadge } from "../components/ui";
import type {
  DashboardSummary,
  DashboardTodos,
  PaginatedResponse,
  QualityTrendResponse,
  Receipt,
  UserProfile,
  IQCRecord,
  Nonconformance,
} from "../types";

const { Title, Text } = Typography;

const taiwanDateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatTaiwanDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return taiwanDateFormatter.format(date);
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

  const [selectedIqcId, setSelectedIqcId] = useState<number | null>(null);
  const [iqcDetailModalOpen, setIqcDetailModalOpen] = useState(false);

  const iqcDetailQuery = useQuery<IQCRecord>({
    queryKey: ["iqc", "detail", selectedIqcId],
    queryFn: () => api.getIQCRecord(selectedIqcId!),
    enabled: !!selectedIqcId,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const handleOpenIqcDetail = (id: number) => {
    setSelectedIqcId(id);
    setIqcDetailModalOpen(true);
  };

  const handleCloseIqcDetail = () => {
    setIqcDetailModalOpen(false);
    setSelectedIqcId(null);
  };

  const [selectedNcId, setSelectedNcId] = useState<number | null>(null);
  const [ncDetailModalOpen, setNcDetailModalOpen] = useState(false);

  const ncDetailQuery = useQuery<Nonconformance>({
    queryKey: ["nonconformance", "detail", selectedNcId],
    queryFn: () => api.getNonconformance(selectedNcId!),
    enabled: !!selectedNcId,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const handleOpenNcDetail = (id: number) => {
    setSelectedNcId(id);
    setNcDetailModalOpen(true);
  };

  const handleCloseNcDetail = () => {
    setNcDetailModalOpen(false);
    setSelectedNcId(null);
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
        <Space direction="vertical" size="middle" style={{ width: "100%", marginBottom: 20 }}>
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
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                  <Card size="small">
                    <Flex align="center" gap={12} style={{ marginBottom: 8 }}>
                      <InboxOutlined style={{ fontSize: 20, color: "#8c8c8c" }} />
                      <Statistic
                        title="收料總數"
                        value={summary.receipts.total}
                        precision={0}
                        groupSeparator=","
                      />
                    </Flex>
                    <Divider />
                    <Text type="secondary" style={{ fontSize: 12 }}>收料紀錄總筆數</Text>
                  </Card>
                </Col>
              </Row>
            </Card>
          )}

          {summary?.internal_lots && (
            <Card
              title="內部批號統計"
              extra={<Text type="secondary">依內部物料批次彙總</Text>}
              style={{ marginBottom: 24 }}
            >
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} lg={6}>
                  <Card size="small">
                    <Flex align="center" gap={12} style={{ marginBottom: 8 }}>
                      <NumberOutlined style={{ fontSize: 20, color: "#8c8c8c" }} />
                      <Statistic
                        title="內部批次總數"
                        value={summary.internal_lots.total}
                        precision={0}
                        groupSeparator=","
                      />
                    </Flex>
                    <Divider />
                    <Text type="secondary" style={{ fontSize: 12 }}>內部批號總筆數</Text>
                  </Card>
                </Col>
              </Row>
              {lotStatusEntries.length > 0 && (
                <div>
                  <Text strong style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
                    批號狀態分布
                  </Text>
                  <Table
                    dataSource={lotStatusEntries.map(([status, count]) => ({ status, count }))}
                    rowKey="status"
                    columns={[
                      { title: "批號狀態", dataIndex: "status", key: "status", render: (status: string) => <Tag color={getStatusColor(status)}>{status}</Tag> },
                      { title: "數量", dataIndex: "count", key: "count", align: "right" },
                    ]}
                    pagination={false}
                    bordered
                    size="middle"
                  />
                </div>
              )}
              {lotStatusEntries.length === 0 && (
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
                          onClick={() => handleOpenIqcDetail(record.id)}
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
                          onClick={() => handleOpenNcDetail(record.id)}
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
        width={720}
        destroyOnHidden
      >
        {iqcDetailQuery.isLoading ? (
          <Flex align="center" style={{ padding: "40px 0" }}>
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
        ) : iqcDetailQuery.data ? (
          <Descriptions column={2} size="small" layout="horizontal">
            <Descriptions.Item label="IQC 編號">IQC-{iqcDetailQuery.data.id}</Descriptions.Item>
            <Descriptions.Item label="收料單號">{iqcDetailQuery.data.receipt_id ? `收料單 ${iqcDetailQuery.data.receipt_id}` : "—"}</Descriptions.Item>
            <Descriptions.Item label="內部批號">{iqcDetailQuery.data.internal_lot_no ?? (iqcDetailQuery.data.internal_lot_id ? `內部批號 ${iqcDetailQuery.data.internal_lot_id}` : "—")}</Descriptions.Item>
            <Descriptions.Item label="供應商">
              {iqcDetailQuery.data.receipt_id
                ? "—"
                : iqcDetailQuery.data.internal_lot_id
                ? "—"
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="物料">
              {iqcDetailQuery.data.internal_lot_id ? "—" : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="抽樣數量">{iqcDetailQuery.data.sample_qty}</Descriptions.Item>
            <Descriptions.Item label="檢驗日期">
              {iqcDetailQuery.data.inspection_date
                ? formatTaiwanDate(iqcDetailQuery.data.inspection_date)
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="檢驗結果">
              <Tag color={getStatusColor(iqcDetailQuery.data.inspection_result)}>
                {iqcDetailQuery.data.inspection_result}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="放行狀態">
              <Tag color={getStatusColor(iqcDetailQuery.data.release_status)}>
                {iqcDetailQuery.data.release_status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="審核狀態">
              <Tag color={getStatusColor(iqcDetailQuery.data.review_status || "pending")}>
                {iqcDetailQuery.data.review_status || "pending"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="建立時間">{formatTaiwanDate(iqcDetailQuery.data.created_at)}</Descriptions.Item>
            <Descriptions.Item label="檢驗備註">{iqcDetailQuery.data.remarks || "—"}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Flex vertical gap={4} align="center">
                <Text strong>找不到 IQC 資料</Text>
                <Text type="secondary">請重新整理後再試一次。</Text>
              </Flex>
            }
          />
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
        width={900}
        destroyOnHidden
      >
        {ncDetailQuery.isLoading ? (
          <Flex align="center" style={{ padding: "40px 0" }}>
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
        ) : ncDetailQuery.data ? (
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            {/* 基本資訊 */}
            <Space wrap size="middle">
              <StatusBadge value={ncDetailQuery.data.status} />
              <Text>來源：{ncDetailQuery.data.source}</Text>
              <SeverityBadge value={ncDetailQuery.data.severity} />
              <Text>不良數量：{ncDetailQuery.data.defect_qty ?? "未填"}</Text>
            </Space>

            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="供應商">{ncDetailQuery.data.supplier_id ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="物料">{ncDetailQuery.data.material_id ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="收料紀錄">{ncDetailQuery.data.receipt_id ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="供應商批號">{ncDetailQuery.data.supplier_lot_id ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="內部批號">{ncDetailQuery.data.internal_lot_id ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="IQC">{ncDetailQuery.data.iqc_record_id ?? "—"}</Descriptions.Item>
            </Descriptions>

            <Divider titlePlacement="start" plain>
              異常描述
            </Divider>
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {ncDetailQuery.data.description}
            </Text>

            <Divider titlePlacement="start" plain>
              調查內容
            </Divider>
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {ncDetailQuery.data.investigation || "無調查內容"}
            </Text>

            <Divider titlePlacement="start" plain>
              圍堵與處置紀錄
            </Divider>
            {ncDetailQuery.data.dispositions?.length ? (
              <Timeline
                items={ncDetailQuery.data.dispositions.map((d) => ({
                  children: (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(d.executed_at).toLocaleString()} · 負責人 ID {d.owner_user_id}
                      </Text>
                      <div>
                        {d.content} — {d.result}
                      </div>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無處置紀錄" />
            )}

            <Divider titlePlacement="start" plain>
              附件
            </Divider>
            {ncDetailQuery.data.attachments?.length ? (
              <Space direction="vertical" size={4}>
                {ncDetailQuery.data.attachments.map((a) => (
                  <Space key={a.id}>
                    <Text>{a.original_filename}</Text>
                  </Space>
                ))}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無附件" />
            )}

            <Divider titlePlacement="start" plain>
              案件歷程
            </Divider>
            {ncDetailQuery.data.history?.length ? (
              <Timeline
                items={ncDetailQuery.data.history.map((h) => ({
                  children: (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(h.created_at).toLocaleString()} · 使用者 {h.actor_user_id}
                      </Text>
                      <div>{h.action}</div>
                      {h.before_data && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-slate-500">變更前後資料</summary>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs">
                            {h.before_data} → {h.after_data}
                          </pre>
                        </details>
                      )}
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無歷程" />
            )}
          </Space>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Flex vertical gap={4} align="center">
                <Text strong>找不到不合格案件資料</Text>
                <Text type="secondary">請重新整理後再試一次。</Text>
              </Flex>
            }
          />
        )}
      </Modal>
    </section>
  );
}