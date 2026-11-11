import type { QualityTrendPoint } from "../types";

const CHART_HEIGHT = 220;
const MARGIN = { top: 24, right: 24, bottom: 40, left: 56 };

type TrendChartProps = {
  title: string;
  data: QualityTrendPoint[];
};

function getXLabels(data: QualityTrendPoint[]): string[] {
  return data.map((point) => point.year_month);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

// 每月合格率趨勢圖（折線圖，pass_rate 0~1）
export function PassRateTrendChart({ title, data }: TrendChartProps) {
  const width = Math.max(320, MARGIN.left + MARGIN.right + 60 * data.length);
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
      <div className="text-sm font-semibold text-slate-900 mb-2">{title}</div>
      <svg width={width} height={height} role="img" aria-label={title}>
        {/* Y 軸格線與刻度 */}
        {[0, 0.5, 1].map((rate) => {
          const cy = y(rate);
          return (
            <g key={rate}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={cy}
                y2={cy}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={cy + 4}
                textAnchor="end"
                fill="#6b7280"
                fontSize={11}
              >
                {formatPercent(rate)}
              </text>
            </g>
          );
        })}
        {/* 折線與資料點 */}
        {data.length > 1 ? (
          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            points={data
              .map((_, i) => `${x(i)},${y(data[i].pass_rate)}`)
              .join(" ")}
          />
        ) : null}
        {data.map((point, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(point.pass_rate)}
            r={3.5}
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        ))}
        {/* X 軸月份標籤 */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={x(i)}
            y={height - MARGIN.bottom + 16}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={11}
          >
            {label}
          </text>
        ))}
        <text
          x={width / 2}
          y={height - 6}
          textAnchor="middle"
          fill="#9ca3af"
          fontSize={10}
        >
          月份（依檢驗日期）
        </text>
      </svg>
      {data.length === 0 && (
        <div className="mt-2 text-xs text-slate-500">此區間沒有可統計的合格率資料。</div>
      )}
    </div>
  );
}

// 每月檢驗量趨勢圖（分組長條圖：總數/合格/不合格）
export function InspectionCountBarChart({ title, data }: TrendChartProps) {
  const series = [
    { key: "total", label: "總數", color: "#6b7280" },
    { key: "passed", label: "合格", color: "#16a34a" },
    { key: "failed", label: "不合格", color: "#dc2626" },
  ];
  const width = Math.max(320, MARGIN.left + MARGIN.right + 70 * data.length);
  const height = CHART_HEIGHT;
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const maxCount =
    data.length > 0 ? Math.max(1, ...data.map((d) => Math.max(d.total, d.passed, d.failed))) : 1;
  const xLabels = getXLabels(data);
  const barCount = series.length;
  const groupWidth = innerWidth / Math.max(data.length, 1);
  const barWidth = groupWidth / (barCount + 1);

  const xGroup = (index: number) => MARGIN.left + (index * innerWidth) / Math.max(data.length, 1);
  const y = (count: number) => MARGIN.top + innerHeight - (count / maxCount) * innerHeight;

  return (
    <div className="w-full" style={{ minWidth: 280 }}>
      <div className="text-sm font-semibold text-slate-900 mb-2">{title}</div>
      <svg width={width} height={height} role="img" aria-label={title}>
        {[0].map((rate) => {
          const cy = y(rate);
          return (
            <line
              key={rate}
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={cy}
              y2={cy}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
          );
        })}
        {data.map((point, gi) => {
          const groupX = xGroup(gi);
          return series.map((s, si) => {
            const value = point[s.key as keyof QualityTrendPoint] as number;
            const bx = groupX + barWidth + si * barWidth;
            return (
              <g key={s.key}>
                <rect
                  x={bx}
                  y={y(value)}
                  width={barWidth - 4}
                  height={innerHeight - (y(value) - MARGIN.top)}
                  fill={s.color}
                  rx={2}
                />
                {value > 0 && (
                  <text
                    x={bx + (barWidth - 4) / 2}
                    y={y(value) - 6}
                    textAnchor="middle"
                    fill="#374151"
                    fontSize={10}
                  >
                    {value}
                  </text>
                )}
              </g>
            );
          });
        })}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={xGroup(i) + groupWidth / 2}
            y={height - MARGIN.bottom + 16}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={11}
          >
            {label}
          </text>
        ))}
      </svg>
      <div className="flex gap-2 mt-2">
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
        <div className="mt-2 text-xs text-slate-500">此區間沒有可統計的檢驗量資料。</div>
      )}
    </div>
  );
}

// 品質趨勢圖容器：左側合格率折線圖，右側檢驗量分組長條圖
export function QualityTrendChart({ data }: { data: QualityTrendPoint[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PassRateTrendChart title="每月合格率趨勢" data={data} />
      <InspectionCountBarChart title="每月檢驗量趨勢" data={data} />
    </div>
  );
}
