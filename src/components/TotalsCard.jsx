import React from "react";
import { Card, Group, Paper, Stack, Text, Title } from "@mantine/core";

export default function TotalsCard({ totals, formatDuration }) {
  return (
    <Card radius="xl" shadow="sm" withBorder className="glass-card totals-card">
      <Stack gap="sm">
        <Title order={3}>Totals by Hobby</Title>
        {totals.length === 0 ? (
          <Text c="dimmed">No tracked time yet.</Text>
        ) : (
          totals.map(([hobby, seconds]) => (
            <Paper key={hobby} withBorder p="sm" radius="md" className="row-paper">
              <Group justify="space-between">
                <Text>{hobby}</Text>
                <Text fw={700}>{formatDuration(seconds)}</Text>
              </Group>
            </Paper>
          ))
        )}
      </Stack>
    </Card>
  );
}
