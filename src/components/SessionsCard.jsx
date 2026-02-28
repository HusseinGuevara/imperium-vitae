import React from "react";
import { Card, Group, Paper, Stack, Text, Title } from "@mantine/core";

export default function SessionsCard({ sessions, formatDuration }) {
  return (
    <Card radius="xl" shadow="sm" withBorder className="glass-card sessions-card">
      <Stack gap="sm">
        <Title order={3}>Recent Sessions</Title>
        {sessions.length === 0 ? (
          <Text c="dimmed">No sessions yet.</Text>
        ) : (
          sessions.map((session, index) => (
            <Paper key={`${session.endedAt}-${index}`} withBorder p="sm" radius="md" className="row-paper">
              <Group justify="space-between" align="flex-start">
                <Text size="sm">{session.hobby} · {new Date(session.endedAt).toLocaleString()}</Text>
                <Text fw={700} size="sm">{formatDuration(session.duration)}</Text>
              </Group>
            </Paper>
          ))
        )}
      </Stack>
    </Card>
  );
}
