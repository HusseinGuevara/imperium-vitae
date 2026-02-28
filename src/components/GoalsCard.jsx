import React from "react";
import { Badge, Button, Card, Group, NumberInput, Progress, Stack, Text, Title } from "@mantine/core";

export default function GoalsCard({ dailyGoalInput, weeklyGoalInput, goals, streak, onDailyGoalChange, onWeeklyGoalChange, onSaveGoals, formatDuration }) {
  return (
    <Card radius="xl" shadow="sm" withBorder className="glass-card goals-card">
      <Stack gap="sm">
        <Title order={3}>Goals & Streaks</Title>
        <Text size="sm" c="dimmed" className="section-subtitle">
          Keep your routine consistent and grow your streak.
        </Text>
        <Group grow>
          <NumberInput
            label="Daily Goal (minutes)"
            min={1}
            value={dailyGoalInput}
            onChange={(value) => onDailyGoalChange(String(value ?? ""))}
          />
          <NumberInput
            label="Weekly Goal (minutes)"
            min={1}
            value={weeklyGoalInput}
            onChange={(value) => onWeeklyGoalChange(String(value ?? ""))}
          />
        </Group>
        <Button variant="light" onClick={onSaveGoals}>
          Save Goals
        </Button>
        <Text size="sm">Today: {formatDuration(goals.todaySeconds)} / {formatDuration(goals.dailyGoalSeconds)}</Text>
        <Progress value={goals.dailyPercent} radius="xl" />
        <Text size="sm">This Week: {formatDuration(goals.weekSeconds)} / {formatDuration(goals.weeklyGoalSeconds)}</Text>
        <Progress value={goals.weeklyPercent} radius="xl" color="cyan" />
        <Group justify="space-between">
          <Badge size="lg" color="indigo" variant="light">
            Current streak: {streak.current} day(s)
          </Badge>
          <Badge size="lg" color="teal" variant="light">
            Best: {streak.best}
          </Badge>
        </Group>
      </Stack>
    </Card>
  );
}
