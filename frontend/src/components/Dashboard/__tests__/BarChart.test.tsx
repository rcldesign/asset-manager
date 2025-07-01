import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BarChart } from '../BarChart';

// Mock Chart.js
jest.mock('react-chartjs-2', () => ({
  Bar: jest.fn(({ data, options, ...props }) => (
    <div data-testid="bar-chart" {...props}>
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="chart-options">{JSON.stringify(options)}</div>
    </div>
  )),
}));

describe('BarChart', () => {
  const mockData = {
    labels: ['Assets', 'Tasks', 'Users'],
    datasets: [
      {
        label: 'Count',
        data: [150, 89, 12],
        backgroundColor: ['#2196f3', '#4caf50', '#ff9800'],
      },
    ],
  };

  const mockOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Dashboard Overview',
      },
    },
  };

  it('should render bar chart with data', () => {
    render(<BarChart data={mockData} />);

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    
    const chartData = screen.getByTestId('chart-data');
    expect(chartData).toHaveTextContent('Assets');
    expect(chartData).toHaveTextContent('150');
  });

  it('should render with custom options', () => {
    render(<BarChart data={mockData} options={mockOptions} />);

    const chartOptions = screen.getByTestId('chart-options');
    expect(chartOptions).toHaveTextContent('Dashboard Overview');
    expect(chartOptions).toHaveTextContent('legend');
  });

  it('should render loading state', () => {
    render(<BarChart data={mockData} loading={true} />);

    expect(screen.getByTestId('chart-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('should render error state', () => {
    const errorMessage = 'Failed to load chart data';
    render(<BarChart data={mockData} error={errorMessage} />);

    expect(screen.getByTestId('chart-error')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('should render empty state when no data', () => {
    const emptyData = {
      labels: [],
      datasets: [],
    };

    render(<BarChart data={emptyData} />);

    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('should handle click events', () => {
    const onClickMock = jest.fn();
    render(<BarChart data={mockData} onClick={onClickMock} />);

    const chart = screen.getByTestId('bar-chart');
    fireEvent.click(chart);

    expect(onClickMock).toHaveBeenCalled();
  });

  it('should apply custom height', () => {
    render(<BarChart data={mockData} height={400} />);

    const chart = screen.getByTestId('bar-chart');
    expect(chart).toHaveAttribute('height', '400');
  });

  it('should render with custom className', () => {
    render(<BarChart data={mockData} className="custom-chart" />);

    const chart = screen.getByTestId('bar-chart');
    expect(chart).toHaveClass('custom-chart');
  });

  it('should handle data updates', () => {
    const { rerender } = render(<BarChart data={mockData} />);

    const updatedData = {
      ...mockData,
      datasets: [
        {
          ...mockData.datasets[0],
          data: [200, 150, 20],
        },
      ],
    };

    rerender(<BarChart data={updatedData} />);

    const chartData = screen.getByTestId('chart-data');
    expect(chartData).toHaveTextContent('200');
    expect(chartData).toHaveTextContent('150');
    expect(chartData).toHaveTextContent('20');
  });

  it('should render with animation options', () => {
    const animationOptions = {
      animation: {
        duration: 1000,
        easing: 'easeInOutQuart',
      },
    };

    render(<BarChart data={mockData} options={animationOptions} />);

    const chartOptions = screen.getByTestId('chart-options');
    expect(chartOptions).toHaveTextContent('easeInOutQuart');
  });

  it('should handle responsive sizing', () => {
    render(<BarChart data={mockData} responsive={true} />);

    const chart = screen.getByTestId('bar-chart');
    expect(chart).toHaveAttribute('data-responsive', 'true');
  });

  it('should render with accessibility attributes', () => {
    render(
      <BarChart 
        data={mockData} 
        aria-label="Asset statistics chart"
        role="img"
      />
    );

    const chart = screen.getByTestId('bar-chart');
    expect(chart).toHaveAttribute('aria-label', 'Asset statistics chart');
    expect(chart).toHaveAttribute('role', 'img');
  });

  it('should handle multiple datasets', () => {
    const multiDatasetData = {
      labels: ['Jan', 'Feb', 'Mar'],
      datasets: [
        {
          label: 'Assets',
          data: [10, 20, 30],
          backgroundColor: '#2196f3',
        },
        {
          label: 'Tasks',
          data: [15, 25, 35],
          backgroundColor: '#4caf50',
        },
      ],
    };

    render(<BarChart data={multiDatasetData} />);

    const chartData = screen.getByTestId('chart-data');
    expect(chartData).toHaveTextContent('Assets');
    expect(chartData).toHaveTextContent('Tasks');
  });

  it('should render with custom color scheme', () => {
    const colorScheme = ['#e3f2fd', '#bbdefb', '#90caf9'];
    render(
      <BarChart 
        data={mockData} 
        colorScheme={colorScheme}
      />
    );

    const chartData = screen.getByTestId('chart-data');
    expect(chartData).toHaveTextContent('#e3f2fd');
  });

  it('should handle data formatting', () => {
    const dataWithFormatting = {
      ...mockData,
      datasets: [
        {
          ...mockData.datasets[0],
          data: [1500, 890, 120],
        },
      ],
    };

    const formatOptions = {
      scales: {
        y: {
          ticks: {
            callback: (value: any) => `${value.toLocaleString()}`,
          },
        },
      },
    };

    render(
      <BarChart 
        data={dataWithFormatting} 
        options={formatOptions}
      />
    );

    const chartOptions = screen.getByTestId('chart-options');
    expect(chartOptions).toHaveTextContent('callback');
  });
});