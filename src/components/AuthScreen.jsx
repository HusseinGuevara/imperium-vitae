import React from "react";
import { Button, Card, Container, Group, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { AppleLogoIcon, GoogleLogoIcon } from "./icons";

export default function AuthScreen({
  baseUrl,
  authEmailInput,
  authPasswordInput,
  authStatus,
  authChecked,
  hasFirebaseConfigured,
  onEmailChange,
  onPasswordChange,
  onGoogleSignIn,
  onAppleSignIn,
  onSignUp,
  onLogIn,
}) {
  return (
    <div className="app-bg">
      <Container size="sm" py="xl">
        <Stack gap="md">
          <div className="login-logo-wrap">
            <img className="hero-logo" src={`${baseUrl}progressxp-logo.png`} alt="Progress XP logo" />
          </div>

          <Card radius="xl" shadow="sm" withBorder className="glass-card cloud-card">
            <Stack gap="sm">
              <Title order={3}>Create Account</Title>
              <Text c="dimmed" size="sm">
                Sign up once to unlock Progress XP and stay logged in across sessions.
              </Text>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <TextInput
                  label="Email"
                  placeholder="you@example.com"
                  value={authEmailInput}
                  onChange={(event) => onEmailChange(event.currentTarget.value)}
                />
                <TextInput
                  type="password"
                  label="Password"
                  placeholder="At least 6 characters"
                  value={authPasswordInput}
                  onChange={(event) => onPasswordChange(event.currentTarget.value)}
                />
              </SimpleGrid>
              <Group className="social-auth-row">
                <Button
                  className="auth-provider-btn google-btn"
                  variant="light"
                  leftSection={<GoogleLogoIcon />}
                  onClick={onGoogleSignIn}
                >
                  Continue with Google
                </Button>
                <Button
                  className="auth-provider-btn apple-btn"
                  variant="light"
                  leftSection={<AppleLogoIcon />}
                  onClick={onAppleSignIn}
                >
                  Continue with Apple
                </Button>
              </Group>
              <Group>
                <Button variant="light" onClick={onSignUp}>Sign Up</Button>
                <Button onClick={onLogIn}>Log In</Button>
              </Group>
              {!hasFirebaseConfigured ? (
                <Text size="sm" c="dimmed">
                  Login is not available yet. Firebase sign-in providers must be enabled.
                </Text>
              ) : null}
              {hasFirebaseConfigured && !authChecked ? (
                <Text size="sm" c="dimmed">Checking saved session...</Text>
              ) : null}
              {authStatus ? <Text size="sm" c="blue" className="status-text">{authStatus}</Text> : null}
            </Stack>
          </Card>
        </Stack>
      </Container>
    </div>
  );
}
