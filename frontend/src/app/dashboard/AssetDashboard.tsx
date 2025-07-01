'use client';

import { Box, Grid, Paper, Typography, Button, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { 
  Build as AssetIcon,
  Warning as WarningIcon,
  Schedule as MaintenanceIcon,
  TrendingUp as TrendIcon,
  DateRange as DateRangeIcon,
  Category as CategoryIcon
} from '@mui/icons-material';
import { useDashboardOverview, useAssetChart } from '@/hooks/use-dashboard';
import { useAssets } from '@/hooks/use-assets';
import { StatCard } from '@/components/Dashboard/StatCard';
import { ChartContainer } from '@/components/Dashboard/ChartContainer';
import { PieChart } from '@/components/Dashboard/PieChart';
import { BarChart } from '@/components/Dashboard/BarChart';
import { LineChart } from '@/components/Dashboard/LineChart';
import { useState, useMemo } from 'react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { AssetStatus } from '@/types';

export default function AssetDashboard() {
  const [chartView, setChartView] = useState<'category' | 'status' | 'location'>('category');
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  
  const { data: overview, isLoading: overviewLoading } = useDashboardOverview();
  const { data: assetChart, isLoading: assetChartLoading } = useAssetChart(chartType, chartView);
  const { data: assetsData, isLoading: assetsLoading } = useAssets({ limit: 1000 }); // Get all assets for analysis

  // Calculate asset age distribution
  const ageDistribution = useMemo(() => {
    if (!assetsData?.data) return null;

    const distribution = {
      '< 1 year': 0,
      '1-2 years': 0,
      '2-3 years': 0,
      '3-5 years': 0,
      '> 5 years': 0,
    };

    assetsData.data.forEach(asset => {
      if (asset.purchaseDate) {
        const age = differenceInDays(new Date(), parseISO(asset.purchaseDate)) / 365;
        if (age < 1) distribution['< 1 year']++;
        else if (age < 2) distribution['1-2 years']++;
        else if (age < 3) distribution['2-3 years']++;
        else if (age < 5) distribution['3-5 years']++;
        else distribution['> 5 years']++;
      }
    });

    return {
      labels: Object.keys(distribution),
      datasets: [{
        label: 'Asset Age',
        data: Object.values(distribution),
        backgroundColor: ['#4caf50', '#2196f3', '#ff9800', '#f44336', '#9c27b0'],
      }]
    };
  }, [assetsData]);

  // Calculate warranty expiry timeline
  const warrantyTimeline = useMemo(() => {
    if (!assetsData?.data) return null;

    const timeline = {
      'Expired': 0,
      'This month': 0,
      '1-3 months': 0,
      '3-6 months': 0,
      '6-12 months': 0,
      '> 1 year': 0,
    };

    const now = new Date();
    assetsData.data.forEach(asset => {
      if (asset.warrantyExpiry) {
        const daysUntilExpiry = differenceInDays(parseISO(asset.warrantyExpiry), now);
        if (daysUntilExpiry < 0) timeline['Expired']++;
        else if (daysUntilExpiry <= 30) timeline['This month']++;
        else if (daysUntilExpiry <= 90) timeline['1-3 months']++;
        else if (daysUntilExpiry <= 180) timeline['3-6 months']++;
        else if (daysUntilExpiry <= 365) timeline['6-12 months']++;
        else timeline['> 1 year']++;
      }
    });

    return {
      labels: Object.keys(timeline),
      datasets: [{
        label: 'Warranty Status',
        data: Object.values(timeline),
        backgroundColor: '#ff5722',
        borderColor: '#ff5722',
      }]
    };
  }, [assetsData]);

  // Calculate total asset value
  const totalAssetValue = useMemo(() => {
    if (!assetsData?.data) return 0;
    return assetsData.data.reduce((sum, asset) => sum + (asset.purchasePrice || 0), 0);
  }, [assetsData]);

  // Count assets by status
  const statusCounts = useMemo(() => {
    if (!overview?.assets.byStatus) return {};
    return overview.assets.byStatus;
  }, [overview]);

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Asset Dashboard
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Assets"
            value={overview?.assets.total || 0}
            subtitle={`Worth $${totalAssetValue.toLocaleString()}`}
            icon={<AssetIcon fontSize="large" />}
            color="#1976d2"
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Operational"
            value={statusCounts.OPERATIONAL || 0}
            subtitle={`${Math.round(((statusCounts.OPERATIONAL || 0) / (overview?.assets.total || 1)) * 100)}% of total`}
            icon={<TrendIcon fontSize="large" />}
            color="#4caf50"
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Maintenance Required"
            value={overview?.assets.maintenanceNeeded || 0}
            subtitle="Need attention"
            icon={<MaintenanceIcon fontSize="large" />}
            color="#ff9800"
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Warranties Expiring"
            value={overview?.assets.warrantyExpiring || 0}
            subtitle="Next 30 days"
            icon={<WarningIcon fontSize="large" />}
            color="#f44336"
            loading={overviewLoading}
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        {/* Asset Distribution Chart */}
        <Grid item xs={12} md={6}>
          <ChartContainer
            title="Asset Distribution"
            loading={assetChartLoading}
            height={400}
            actions={
              <Box display="flex" gap={1}>
                <FormControl size="small">
                  <Select
                    value={chartView}
                    onChange={(e) => setChartView(e.target.value as any)}
                  >
                    <MenuItem value="category">By Category</MenuItem>
                    <MenuItem value="status">By Status</MenuItem>
                    <MenuItem value="location">By Location</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small">
                  <Select
                    value={chartType}
                    onChange={(e) => setChartType(e.target.value as any)}
                  >
                    <MenuItem value="pie">Pie Chart</MenuItem>
                    <MenuItem value="bar">Bar Chart</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            }
          >
            {assetChart && chartType === 'pie' ? (
              <PieChart data={assetChart} type="doughnut" />
            ) : (
              assetChart && <BarChart data={assetChart} />
            )}
          </ChartContainer>
        </Grid>

        {/* Asset Age Distribution */}
        <Grid item xs={12} md={6}>
          <ChartContainer
            title="Asset Age Distribution"
            subtitle="Based on purchase date"
            loading={assetsLoading}
            height={400}
          >
            {ageDistribution && <BarChart data={ageDistribution} />}
          </ChartContainer>
        </Grid>

        {/* Warranty Timeline */}
        <Grid item xs={12}>
          <ChartContainer
            title="Warranty Expiry Timeline"
            subtitle="Track warranty status across all assets"
            loading={assetsLoading}
            height={300}
          >
            {warrantyTimeline && <BarChart data={warrantyTimeline} horizontal />}
          </ChartContainer>
        </Grid>

        {/* Asset Status Breakdown */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Asset Status Breakdown
            </Typography>
            <Grid container spacing={2}>
              {Object.entries(statusCounts).map(([status, count]) => (
                <Grid item xs={6} sm={4} md={2} key={status}>
                  <Paper
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      backgroundColor: getStatusColor(status as AssetStatus) + '20',
                      borderLeft: `4px solid ${getStatusColor(status as AssetStatus)}`,
                    }}
                  >
                    <Typography variant="h4">
                      {count}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {status}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function getStatusColor(status: AssetStatus): string {
  const colors: Record<AssetStatus, string> = {
    OPERATIONAL: '#4caf50',
    MAINTENANCE: '#ff9800',
    REPAIR: '#f44336',
    RETIRED: '#9e9e9e',
    DISPOSED: '#607d8b',
    LOST: '#795548',
  };
  return colors[status] || '#757575';
}