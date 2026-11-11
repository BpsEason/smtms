import type { QualityTrendPoint } from "../types";

const CHART_HEIGHT = 260;
const MARGIN = { top: 24, right: 24, bottom: 48, left: 64 };

type TrendChartProps = {
  title: string;
  data: QualityTrendPoint[];
};

function getXLabels(data: QualityTrendPoint[]): string[] {
  return data.map((point) => point.year_month);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const PASS_RATE_COLOR = "#1677ff";
const TOTAL_COLOR = "#8c8c8c";
const PASSED_COLOR = "#52c41a";
const FAILED_COLOR = "#ff4d4f";
const GRID_COLOR = "#f0f0f0";
const AXIS_COLOR = "#d9d9d9";
const TEXT_COLOR = "#595959";
const LABEL_COLOR = "#8c8c8c";

function getResponsiveWidth(data: QualityTrendPoint[], minWidth: number, perItem: number): number {
  return Math.max(minWidth, MARGIN.left + MARGIN.right + perItem * data.length);
}

export function PassRateTrendChart({ title, data }: TrendChartProps) {
  const width = getResponsiveWidth(data, 320, 60);
  const height = CHART_HEIGHT;
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const xLabels = getXLabels(data);
  const maxRate = data.length > 0 ? Math.max(1, ...data.map((d) => d.pass_rate)) : 1;
  const yMax = Math.max(maxRate, 0.05);

  const x = (index: number) =>
    MARGIN.left + (innerWidth * index) / Math.max(data.length - 1, 1);
  const y = (rate: number) =>
    MARGIN.top + innerHeight - (rate / yMax) * innerHeight;

  return (
    <div className="w-full" style={{ minWidth: 280 }}>
      <div className="text-sm font-semibold text-gray-900 mb-2">{title}</div>
      <svg width={width} height={height} role="img" aria-label={title}>
        <defs>
          <linearGradient id="passRateGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PASS_RATE_COLOR} stopOpacity={0.3} />
            <stop offset="100%" stopColor={PASS_RATE_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Y 軸格線與刻度 */}
        {[0, 0.25, 0.5, 0.75, 1].map((rate) => {
          const cy = y(rate);
          return (
            <g key={rate}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={cy}
                y2={cy}
                stroke={GRID_COLOR}
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 12}
                y={cy + 4}
                textAnchor="end"
                fill={LABEL_COLOR}
                fontSize={11}
              >
                {formatPercent(rate)}
              </text>
            </g>
          );
        })}
        {/* Y 軸線 */}
        <line
          x1={MARGIN.left}
          x2={MARGIN.left}
          y1={MARGIN.top}
          y2={height - MARGIN.bottom}
          stroke={AXIS_COLOR}
          strokeWidth={1}
        />
        {/* X 軸線 */}
        <line
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={height - MARGIN.bottom}
          y2={height - MARGIN.bottom}
          stroke={AXIS_COLOR}
          strokeWidth={1}
        />
        {/* 區域填充 */}
        {data.length > 1 && (
          <path
            fill="url(#passRateGradient)"
            d={[
              `M ${x(0)} ${height - MARGIN.bottom}`,
              ...data.map((_, i) => `L ${x(i)} ${y(data[i].pass_rate)}`),
              `L ${x(data.length - 1)} ${height - MARGIN.bottom}`,
              "Z",
            ].join(" ")}
          />
        )}
        {/* 折線 */}
        {data.length > 1 && (
          <polyline
            fill="none"
            stroke={PASS_RATE_COLOR}
            strokeWidth={2}
            points={data
              .map((_, i) => `${x(i)},${y(data[i].pass_rate)}`)
              .join(" ")}
          />
        )}
        {/* 資料點 */}
        {data.map((point, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(point.pass_rate)}
            r={4}
            fill={PASS_RATE_COLOR}
            stroke="#ffffff"
            strokeWidth={2}
          />
        ))}
        {/* X 軸月份標籤 */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={x(i)}
            y={height - MARGIN.bottom + 20}
            textAnchor="middle"
            fill={LABEL_COLOR}
            fontSize={11}
          >
            {label}
          </text>
        ))}
        <text
          x={width / 2}
          y={height - 8}
          textAnchor="middle"
          fill={LABEL_COLOR}
          fontSize={10}
        >
          月份（依檢驗日期）
        </text>
      </svg>
      {data.length === 0 && (
        <div className="mt-2 text-xs text-gray-500">此區間沒有可統計的合格率資料。</div>
      )}
    </div>
  );
}

export function InspectionCountBarChart({ title, data }: TrendChartProps) {
  const series = [
    { key: "total", label: "總數", color: TOTAL_COLOR },
    { key: "passed", label: "合格", color: PASSED_COLOR },
    { key: "failed", label: "不合格", color: FAILED_COLOR },
  ];
  const width = getResponsiveWidth(data, 320, 70);
  const height = CHART_HEIGHT;
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const maxCount =
    data.length > 0 ? Math.max(1, ...data.map((d) => Math.max(d.total, d.passed, d.failed))) : 1;
  const xLabels = getXLabels(data);
  const barCount = series.length;
  const groupWidth = innerWidth / Math.max(data.length, 1);
  const barWidth = groupWidth / (barCount + 0.5);

  const xGroup = (index: number) => MARGIN.left + (index * innerWidth) / Math.max(data.length, 1);
  const y = (count: number) => MARGIN.top + innerHeight - (count / maxCount) * innerHeight;

  return (
    <div className="w-full" style={{ minWidth: 280 }}>
      <div className="text-sm font-semibold text-gray-900 mb-2">{title}</div>
      <svg width={width} height={height} role="img" aria-label={title}>
        {/* Y 軸格線 */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const count = ratio * maxCount;
          const cy = y(count);
          return (
            <line
              key={ratio}
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={cy}
              y2={cy}
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
          );
        })}
        {/* Y 軸線 */}
        <line
          x1={MARGIN.left}
          x2={MARGIN.left}
          y1={MARGIN.top}
          y2={height - MARGIN.bottom}
          stroke={AXIS_COLOR}
          strokeWidth={1}
        />
        {/* X 軸線 */}
        <line
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={height - MARGIN.bottom}
          y2={height - MARGIN.bottom}
          stroke={AXIS_COLOR}
          strokeWidth={1}
        />
        {/* 長條圖 */}
        {data.map((point, gi) => {
          const groupX = xGroup(gi);
          return series.map((s, si) => {
            const value = point[s.key as keyof QualityTrendPoint] as number;
            const bx = groupX + barWidth * 0.5 + si * barWidth;
            const barHeight = innerHeight - (y(value) - MARGIN.top);
            return (
              <g key={s.key}>
                <rect
                  x={bx}
                  y={y(value)}
                  width={barWidth - 4}
                  height={barHeight}
                  fill={s.color}
                  rx={2}
                />
                {value > 0 && (
                  <text
                    x={bx + (barWidth - 4) / 2}
                    y={y(value) - 6}
                    textAnchor="middle"
                    fill={TEXT_COLOR}
                    fontSize={10}
                  >
                    {value}
                  </text>
                )}
              </g>
            );
          });
        })}
        {/* X 軸月份標籤 */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={xGroup(i) + groupWidth / 2}
            y={height - MARGIN.bottom + 20}
            textAnchor="middle"
            fill={LABEL_COLOR}
            fontSize={11}
          >
            {label}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 mt-3">
        {series.map((s) => (
          <span
            key={s.key}
            className="text-xs flex items-center gap-1.5"
            style={{ whiteSpace: "nowrap" }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                background: s.color,
                borderRadius: 2,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
      {data.length === 0 && (
        <div className="mt-2 text-xs text-gray-500">此區間沒有可統計的檢驗量資料。</div>
      )}
    </div>
  );
}

export function QualityTrendChart({ data }: { data: QualityTrendPoint[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PassRateTrendChart title="每月合格率趨勢" data={data} />
      <InspectionCountBarChart title="每月檢驗量趨勢" data={data} />
    </div>
  );
}