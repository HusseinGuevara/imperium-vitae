import React from "react";
import { Burger, Group, Menu, Paper } from "@mantine/core";

export default function TopNav({ baseUrl, accountMenuOpen, setAccountMenuOpen, accountName, accountEmail, onLogOut }) {
  return (
    <Paper p="sm" className="top-nav" radius={0}>
      <div className="top-nav-inner">
        <Group justify="space-between" align="center" wrap="nowrap">
          <img className="nav-logo" src={`${baseUrl}progressxp-logo.png`} alt="Progress XP logo" />
          <Menu
            opened={accountMenuOpen}
            onChange={setAccountMenuOpen}
            position="bottom-end"
            shadow="md"
            width={250}
            transitionProps={{ transition: "pop-top-right", duration: 180 }}
          >
            <Menu.Target>
              <div>
                <Burger
                  opened={accountMenuOpen}
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  aria-label="Open account menu"
                  className="account-burger"
                  color="#ffffff"
                />
              </div>
            </Menu.Target>
            <Menu.Dropdown className="account-dropdown">
              <Menu.Label>{accountName}</Menu.Label>
              <Menu.Item disabled>{accountEmail}</Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onLogOut();
                }}
              >
                Log Out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </div>
    </Paper>
  );
}
