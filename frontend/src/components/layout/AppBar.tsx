'use client';

import React from 'react';
import {
  AppBar as MuiAppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Stack,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import HomeIcon from '@mui/icons-material/Home';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CategoryIcon from '@mui/icons-material/Category';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: <HomeIcon /> },
  { label: 'Assets', path: '/assets', icon: <InventoryIcon /> },
  { label: 'Locations', path: '/locations', icon: <LocationOnIcon /> },
  { label: 'Tasks', path: '/tasks', icon: <AssignmentIcon /> },
  { label: 'Schedules', path: '/schedules', icon: <ScheduleIcon /> },
  { label: 'Templates', path: '/asset-templates', icon: <CategoryIcon /> },
];

export const AppBar: React.FC = () => {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  if (!user) {
    return null;
  }

  return (
    <MuiAppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 0, mr: 4 }}>
          Asset Manager
        </Typography>

        <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
          {navItems.map((item) => (
            <Button
              key={item.path}
              color="inherit"
              startIcon={item.icon}
              onClick={() => handleNavigation(item.path)}
              sx={{
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              {item.label}
            </Button>
          ))}
        </Stack>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <NotificationBell />
          <Typography variant="body2">{user.fullName || user.email}</Typography>
          <Button color="inherit" onClick={logout}>
            Logout
          </Button>
        </Box>
      </Toolbar>
    </MuiAppBar>
  );
};