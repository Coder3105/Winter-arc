"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface WeightChartPoint {
  readonly date: string;
  readonly weightKg: number;
  readonly rollingAverageKg: number | null;
}

export function WeightChart({
  points,
  baselineWeightKg,
}: {
  readonly points: readonly WeightChartPoint[];
  readonly baselineWeightKg: number | null;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={[...points]} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="rgba(109, 192, 224, .12)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => value.slice(5)}
          stroke="#6d8c9c"
          tick={{ fontSize: 10 }}
          minTickGap={22}
        />
        <YAxis
          domain={["dataMin - 1", "dataMax + 1"]}
          stroke="#6d8c9c"
          tick={{ fontSize: 10 }}
          width={52}
          tickFormatter={(value: number) => value.toFixed(1)}
        />
        <Tooltip
          contentStyle={{
            background: "#04101a",
            border: "1px solid #45cfff",
            fontSize: 11,
          }}
        />
        {baselineWeightKg !== null && (
          <ReferenceLine
            y={baselineWeightKg}
            stroke="#7995a3"
            strokeDasharray="4 4"
            label={{ value: "BASELINE", fill: "#8ba8b7", fontSize: 9 }}
          />
        )}
        <Line
          type="monotone"
          dataKey="weightKg"
          name="Daily weight"
          stroke="#6d9aaa"
          strokeWidth={1.5}
          dot={{ r: 2, fill: "#9fdfff" }}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="rollingAverageKg"
          name="7-day average"
          stroke="#34cfff"
          strokeWidth={3}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
