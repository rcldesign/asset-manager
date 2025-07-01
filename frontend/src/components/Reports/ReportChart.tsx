import React from 'react';
import { Box, useTheme } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface ReportChartProps {
  type: 'line' | 'bar' | 'pie' | 'doughnut';
  data: any;
  height?: number;
  options?: ChartOptions<any>;
}

export const ReportChart: React.FC<ReportChartProps> = ({
  type,
  data,
  height = 300,
  options: customOptions,
}) => {
  const theme = useTheme();

  const defaultOptions: ChartOptions<any> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            family: theme.typography.fontFamily,
          },
          color: theme.palette.text.primary,
        },
      },
      tooltip: {
        backgroundColor: theme.palette.background.paper,
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.secondary,
        borderColor: theme.palette.divider,
        borderWidth: 1,
      },
    },
  };

  const lineBarOptions: ChartOptions<'line' | 'bar'> = {
    ...defaultOptions,
    scales: {
      x: {
        grid: {
          color: theme.palette.divider,
        },
        ticks: {
          color: theme.palette.text.secondary,
        },
      },
      y: {
        grid: {
          color: theme.palette.divider,
        },
        ticks: {
          color: theme.palette.text.secondary,
        },
      },
    },
  };

  const pieOptions: ChartOptions<'pie' | 'doughnut'> = {
    ...defaultOptions,
  };

  const getOptions = () => {
    switch (type) {
      case 'line':
      case 'bar':
        return { ...lineBarOptions, ...customOptions };
      case 'pie':
      case 'doughnut':
        return { ...pieOptions, ...customOptions };
      default:
        return { ...defaultOptions, ...customOptions };
    }
  };

  const renderChart = () => {
    switch (type) {
      case 'line':
        return <Line data={data} options={getOptions()} />;
      case 'bar':
        return <Bar data={data} options={getOptions()} />;
      case 'pie':
        return <Pie data={data} options={getOptions()} />;
      case 'doughnut':
        return <Doughnut data={data} options={getOptions()} />;
      default:
        return null;
    }
  };

  // Apply default colors if not provided
  if (data.datasets && !data.datasets[0].backgroundColor) {
    const colors = [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.success.main,
      theme.palette.warning.main,
      theme.palette.error.main,
      theme.palette.info.main,
    ];

    data.datasets.forEach((dataset: any, index: number) => {
      if (type === 'line') {
        dataset.borderColor = colors[index % colors.length];
        dataset.backgroundColor = colors[index % colors.length] + '20'; // 20% opacity
      } else if (type === 'bar') {
        dataset.backgroundColor = colors[index % colors.length];
      } else if (type === 'pie' || type === 'doughnut') {
        dataset.backgroundColor = data.labels?.map((_: any, i: number) => colors[i % colors.length]);
      }
    });
  }

  return (
    <Box sx={{ height, position: 'relative' }}>
      {renderChart()}
    </Box>
  );
};