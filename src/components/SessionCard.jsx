import React from "react";
import { Button, Card, Group, Paper, Select, Stack, Text, TextInput, Title } from "@mantine/core";

export default function SessionCard({
  hobbyOptions,
  selectedHobby,
  activeSession,
  newHobby,
  sessionSeconds,
  hobbyCount,
  onSelectHobby,
  onNewHobbyChange,
  onNewHobbyKeyDown,
  onAddHobby,
  onDeleteHobby,
  onStart,
  onPauseResume,
  onStop,
  formatDuration,
}) {
  return (
    <Card radius="xl" shadow="sm" withBorder className="glass-card session-card">
      <Stack gap="sm">
        <Title order={3}>Current Session</Title>
        <Text size="sm" c="dimmed" className="section-subtitle">
          Pick a focus and press start when you begin.
        </Text>
        <Select
          label="Current Hobby"
          data={hobbyOptions}
          value={selectedHobby}
          disabled={Boolean(activeSession)}
          onChange={onSelectHobby}
        />
        <Group>
          <TextInput
            placeholder="Add a new hobby"
            value={newHobby}
            style={{ flex: 1 }}
            disabled={Boolean(activeSession)}
            onChange={(event) => onNewHobbyChange(event.currentTarget.value)}
            onKeyDown={onNewHobbyKeyDown}
          />
        </Group>
        <Group>
          <Button variant="light" onClick={onAddHobby} disabled={Boolean(activeSession)}>
            Add
          </Button>
          <Button
            color="red"
            variant="light"
            onClick={onDeleteHobby}
            disabled={Boolean(activeSession) || hobbyCount <= 1}
          >
            Delete Hobby
          </Button>
        </Group>
        <Paper p="md" radius="md" className="timer-surface">
          <Text size="sm" c="dimmed">
            Live Timer
          </Text>
          <Title order={2} className="timer-text">
            {formatDuration(sessionSeconds)}
          </Title>
          {activeSession?.pausedAt ? (
            <Text size="sm" c="orange" fw={700}>
              Paused
            </Text>
          ) : null}
        </Paper>
        <Group grow>
          <Button onClick={onStart} disabled={Boolean(activeSession)}>
            Start
          </Button>
          <Button
            color={activeSession?.pausedAt ? "teal" : "yellow"}
            variant="light"
            onClick={onPauseResume}
            disabled={!activeSession}
          >
            {activeSession?.pausedAt ? "Resume" : "Pause"}
          </Button>
          <Button color="red" onClick={onStop} disabled={!activeSession}>
            Stop
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
