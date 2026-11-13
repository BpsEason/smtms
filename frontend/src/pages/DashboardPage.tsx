import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Row,
  Col,
  Card,
  Empty,
  Spin,
  Alert,
  Button,
  Typography,
  Space,
  Flex,
} from "antd";
import { ApiError, api } from "../api";
import { formatErrorMessage } from "../lib/error";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import {
  DashboardSummary,
  hasVisibleSummaryBlocks,
} from "../components/dashboard/DashboardSummary";
import { QualityTrendSection } from "../components/dashboard/QualityTrendSection";
import { DashboardTodos } from "../components/dashboard/DashboardTodos";
import { RecentReceipts } from "../components/dashboard/RecentReceipts";
import { QualityTodoSummary } from "../components/dashboard/QualityTodoSummary";
import { IqcDetailModal } from "../components/dashboard/IqcDetailModal";
import { NonconformanceDetailModal } from "../components/dashboard/NonconformanceDetailModal";
import type {
  DashboardSummary as DashboardSummaryData,
  DashboardTodos as DashboardTodosData,
  OpenNCItem,
  PaginatedResponse,
  PendingIQCItem,
  QualityTrendResponse,
  Receipt,
  UserProfile,
  IQCRecord,
  Nonconformance,
} from "../types";

const { Text } = Typography;

const IQC_SUMMARY_PERMISSIONS = [
  "iqc:read",
  "quality:review",
  "quality:approve",
  "quality:return",
];

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

  const summaryQuery = useQuery<DashboardSummaryData>({
    queryKey: ["dashboard", "summary"],
    queryFn: () => api.getDashboardSummary(),
    enabled: canReadDashboardSummary,
    retry: 1,
    staleTime: 30 * 1000,
  });

  const todosQuery = useQuery<DashboardTodosData>({
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

  const showNoDataPanel =
    !loading &&
    !canReadReceipts &&
    (!canReadDashboardSummary || summaryForbidden || (!summaryQuery.isLoading && !hasVisibleSummaryBlocks(summary)));

  return (
    <section>
      <DashboardHeader
        loading={loading}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

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

      {!loading && !summaryForbidden && hasVisibleSummaryBlocks(summary) && (
        <DashboardSummary summary={summary} />
      )}

      {canReadQualityTrend && !trendForbidden && (
        <QualityTrendSection data={trend} loading={trendQuery.isLoading} error={trendError} />
      )}

      {canReadTodos && !todosForbidden && (
        <DashboardTodos
          todos={todos}
          loading={todosQuery.isLoading}
          onOpenIqc={handleOpenIqcDetail}
          onOpenNc={handleOpenNcDetail}
        />
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
            <RecentReceipts
              receipts={receiptsQuery.data}
              loading={receiptsQuery.isLoading}
              error={receiptsQuery.error}
            />
          </Col>
        )}

        <Col xs={24} lg={8}>
          <QualityTodoSummary
            summary={summary}
            loading={loading}
            hasError={Boolean(summaryQuery.error)}
            canReadMaterials={canReadMaterials}
          />
        </Col>
      </Row>

      <Text type="secondary" style={{ marginTop: 20, fontSize: 12 }}>
        儀表板統計來源為後端彙總 API；未提供之指標不於前端推算。
      </Text>

      <IqcDetailModal
        open={iqcDetailModalOpen}
        item={selectedIqc}
        detail={iqcDetailQuery.data}
        loading={iqcDetailQuery.isLoading}
        error={iqcDetailQuery.error}
        onClose={handleCloseIqcDetail}
        onRetry={() => void iqcDetailQuery.refetch()}
      />

      <NonconformanceDetailModal
        open={ncDetailModalOpen}
        item={selectedNc}
        detail={ncDetailQuery.data}
        loading={ncDetailQuery.isLoading}
        error={ncDetailQuery.error}
        attachmentError={ncAttachmentError}
        onClose={handleCloseNcDetail}
        onRetry={() => void ncDetailQuery.refetch()}
        onDownloadAttachment={handleDownloadAttachment}
      />
    </section>
  );
}