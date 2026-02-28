import React from "react";
import { Card, Select, SegmentedControl, SimpleGrid, Stack, Text, Title } from "@mantine/core";

export default function ChartsCard({
  chartPeriod,
  chartHobby,
  chartHobbyOptions,
  chartBuckets,
  maxSeconds,
  onChartPeriodChange,
  onChartHobbyChange,
  formatChartTime,
  formatDuration,
}) {
  return (
    <Card radius="xl" shadow="sm" withBorder className="glass-card charts-card">
      <Stack gap="sm">
        <Title order={3}>Practice Charts</Title>
        <Text size="sm" c="dimmed" className="section-subtitle">
          Review daily, weekly, monthly, and yearly consistency.
        </Text>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
          <SegmentedControl
            fullWidth
            value={chartPeriod}
            onChange={onChartPeriodChange}
            data={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly" },
            ]}
          />
          <Select
            data={chartHobbyOptions}
            value={chartHobby}
            onChange={(value) => onChartHobbyChange(value || "__all__")}
          />
        </SimpleGrid>
        <div className="chart-wrap">
          {chartBuckets.map((bucket) => {
            const barHeight = Math.round((bucket.seconds / maxSeconds) * 160) + 6;
            return (
              <div className="chart-col" key={bucket.key}>
                <Text size="xs" c="dimmed">
                  {formatChartTime(bucket.seconds)}
                </Text>
                <div className="chart-bar" style={{ height: `${barHeight}px` }} title={formatDuration(bucket.seconds)} />
                <Text size="xs" fw={700}>
                  {bucket.label}
                </Text>
              </div>
            );
          })}
        </div>
      </Stack>
    </Card>
  );
}
