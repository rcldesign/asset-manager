'use client';

import { Box, Grid, Paper, Typography, IconButton, Chip } from '@mui/material';
import { 
  Build as AssetIcon,
  Assignment as TaskIcon,
  People as PeopleIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useDashboardOverview, useDashboardKPIs, useTaskChart, useAssetChart } from '@/hooks/use-dashboard';
import { StatCard } from '@/components/Dashboard/StatCard';
import { ActivityFeed } from '@/components/Dashboard/ActivityFeed';
import { ChartContainer } from '@/components/Dashboard/ChartContainer';
import { PieChart } from '@/components/Dashboard/PieChart';
import { LineChart } from '@/components/Dashboard/LineChart';
import { MiniCalendar } from '@/components/Dashboard/MiniCalendar';
import { QuickActions } from '@/components/Dashboard/QuickActions';
import { useState } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useTasks } from '@/hooks/use-tasks';

export default function OverviewDashboard() {
  const router = useRouter();
  const [filters, setFilters] = useState({});
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useDashboardOverview(filters);
  const { data: kpis, isLoading: kpisLoading } = useDashboardKPIs('month', true);
  const { data: taskChart, isLoading: taskChartLoading } = useTaskChart({ groupBy: 'day' });
  const { data: assetChart, isLoading: assetChartLoading } = useAssetChart('pie', 'category');
  const { data: tasksData } = useTasks({ limit: 1000 });

  const handleRefresh = () => {
    refetchOverview();
  };

  const handleDateClick = (date: Date) => {
    router.push(`/tasks?date=${format(date, 'yyyy-MM-dd')}`);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Overview Dashboard
        </Typography>
        <IconButton onClick={handleRefresh} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Assets"
            value={overview?.assets.total || 0}
            subtitle={`${overview?.assets.warrantyExpiring || 0} warranties expiring`}
            icon={<AssetIcon fontSize="large" />}
            color="#1976d2"
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Tasks"
            value={overview?.tasks.total || 0}
            subtitle={`${overview?.tasks.overdue || 0} overdue`}
            icon={<TaskIcon fontSize="large" />}
            color="#2e7d32"
            loading={overviewLoading}
            trend={kpis?.taskCompletionRate.change ? {
              value: kpis.taskCompletionRate.change,
              label: 'vs last month'
            } : undefined}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Task Completion Rate"
            value={kpis?.taskCompletionRate.current ? `${Math.round(kpis.taskCompletionRate.current)}%` : '0%'}
            subtitle="This month"
            icon={<CheckIcon fontSize="large" />}
            color="#ed6c02"
            loading={kpisLoading}
            trend={kpis?.taskCompletionRate.change ? {
              value: Math.round(kpis.taskCompletionRate.change),
              label: 'vs last month'
            } : undefined}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Asset Utilization"
            value={kpis?.assetUtilization.current ? `${Math.round(kpis.assetUtilization.current)}%` : '0%'}
            subtitle="Operational assets"
            icon={<WarningIcon fontSize="large" />}
            color="#9c27b0"
            loading={kpisLoading}
          />
        </Grid>
      </Grid>

      {/* Quick Stats Row */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" gap={2} flexWrap="wrap">
              <Chip
                label={`${overview?.tasks.dueToday || 0} tasks due today`}
                color="warning"
                icon={<ScheduleIcon />}
              />
              <Chip
                label={`${overview?.tasks.upcoming || 0} upcoming tasks`}
                color="info"
                icon={<ScheduleIcon />}
              />
              <Chip
                label={`${overview?.assets.maintenanceNeeded || 0} assets need maintenance`}
                color="error"
                icon={<AssetIcon />}
              />
              <Chip
                label={`${overview?.users.active || 0} active users`}
                color="success"
                icon={<PeopleIcon />}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Charts and Activity */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <ChartContainer
                title="Task Completion Trends"
                subtitle="Last 30 days"
                loading={taskChartLoading}
                height={350}
              >
                {taskChart && <LineChart data={taskChart} stacked />}
              </ChartContainer>
            </Grid>
            <Grid item xs={12}>
              <ActivityFeed 
                activities={overview?.recentActivity || []} 
                loading={overviewLoading}
              />
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={12} md={4}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <ChartContainer
                title="Assets by Category"
                loading={assetChartLoading}
                height={350}
              >
                {assetChart && <PieChart data={assetChart} type="doughnut" />}
              </ChartContainer>
            </Grid>
            <Grid item xs={12}>
              <MiniCalendar 
                tasks={tasksData?.data || []}
                onDateClick={handleDateClick}
              />
            </Grid>
            <Grid item xs={12}>
              <QuickActions />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
}