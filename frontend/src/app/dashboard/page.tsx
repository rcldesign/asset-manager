'use client';

import { useState } from 'react';
import { ProtectedRoute } from '../../components/protected-route';
import {
  Box,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import { 
  Dashboard as DashboardIcon,
  Build as AssetIcon,
  CalendarMonth as CalendarIcon,
  ViewKanban as KanbanIcon
} from '@mui/icons-material';
import OverviewDashboard from './Overview';
import AssetDashboard from './AssetDashboard';
import CalendarDashboard from './CalendarDashboard';
import TaskDashboard from './TaskDashboard';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box p={3}>
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="dashboard tabs"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab 
            icon={<DashboardIcon />} 
            iconPosition="start" 
            label="Overview" 
            id="dashboard-tab-0"
            aria-controls="dashboard-tabpanel-0"
          />
          <Tab 
            icon={<AssetIcon />} 
            iconPosition="start" 
            label="Assets" 
            id="dashboard-tab-1"
            aria-controls="dashboard-tabpanel-1"
          />
          <Tab 
            icon={<CalendarIcon />} 
            iconPosition="start" 
            label="Calendar" 
            id="dashboard-tab-2"
            aria-controls="dashboard-tabpanel-2"
          />
          <Tab 
            icon={<KanbanIcon />} 
            iconPosition="start" 
            label="Tasks" 
            id="dashboard-tab-3"
            aria-controls="dashboard-tabpanel-3"
          />
        </Tabs>
      </Paper>

      <TabPanel value={activeTab} index={0}>
        <OverviewDashboard />
      </TabPanel>
      <TabPanel value={activeTab} index={1}>
        <AssetDashboard />
      </TabPanel>
      <TabPanel value={activeTab} index={2}>
        <CalendarDashboard />
      </TabPanel>
      <TabPanel value={activeTab} index={3}>
        <TaskDashboard />
      </TabPanel>
    </Box>
  );
}