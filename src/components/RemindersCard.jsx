import React from "react";
import { Button, Card, Group, Stack, Switch, Text, TextInput, Title } from "@mantine/core";

export default function RemindersCard({ reminderTimeInput, reminderEnabled, onReminderTimeChange, onSaveReminderTime, onToggleReminders }) {
  return (
    <Card radius="xl" shadow="sm" withBorder className="glass-card reminders-card">
      <Stack gap="sm">
        <Title order={3}>Reminders</Title>
        <Text c="dimmed" size="sm">Enable a daily prompt to keep your streak going.</Text>
        <Group grow>
          <TextInput type="time" value={reminderTimeInput} onChange={(event) => onReminderTimeChange(event.currentTarget.value)} />
          <Button variant="light" onClick={onSaveReminderTime}>Save Time</Button>
        </Group>
        <Switch
          checked={reminderEnabled}
          onChange={(event) => onToggleReminders(event.currentTarget.checked)}
          label={reminderEnabled ? "Reminders enabled" : "Reminders disabled"}
        />
      </Stack>
    </Card>
  );
}
