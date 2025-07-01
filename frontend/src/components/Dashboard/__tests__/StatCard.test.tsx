import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../StatCard';
import HomeIcon from '@mui/icons-material/Home';

describe('StatCard', () => {
  it('should render title and value', () => {
    render(<StatCard title="Total Assets" value={42} />);
    
    expect(screen.getByText('Total Assets')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('should render string value', () => {
    render(<StatCard title="Status" value="Active" />);
    
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should render subtitle when provided', () => {
    render(
      <StatCard 
        title="Total Assets" 
        value={42} 
        subtitle="Last updated 5 minutes ago"
      />
    );
    
    expect(screen.getByText('Last updated 5 minutes ago')).toBeInTheDocument();
  });

  it('should render icon when provided', () => {
    const { container } = render(
      <StatCard 
        title="Total Assets" 
        value={42} 
        icon={<HomeIcon data-testid="home-icon" />}
      />
    );
    
    expect(screen.getByTestId('home-icon')).toBeInTheDocument();
  });

  it('should apply custom color', () => {
    render(
      <StatCard 
        title="Total Assets" 
        value={42} 
        color="#ff0000"
      />
    );
    
    const valueElement = screen.getByText('42');
    expect(valueElement).toHaveStyle({ color: 'rgb(255, 0, 0)' });
  });

  it('should render loading skeleton when loading is true', () => {
    const { container } = render(
      <StatCard 
        title="Total Assets" 
        value={42} 
        loading={true}
      />
    );
    
    // Should not show actual content
    expect(screen.queryByText('Total Assets')).not.toBeInTheDocument();
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    
    // Should show skeletons
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons).toHaveLength(3);
  });

  it('should render positive trend', () => {
    render(
      <StatCard 
        title="Total Assets" 
        value={42} 
        trend={{ value: 15, label: 'vs last month' }}
      />
    );
    
    const trendText = screen.getByText('+15% vs last month');
    expect(trendText).toBeInTheDocument();
    expect(trendText).toHaveStyle({ color: expect.stringContaining('rgb') }); // success color
  });

  it('should render negative trend', () => {
    render(
      <StatCard 
        title="Total Assets" 
        value={42} 
        trend={{ value: -10, label: 'vs last month' }}
      />
    );
    
    const trendText = screen.getByText('-10% vs last month');
    expect(trendText).toBeInTheDocument();
  });

  it('should render neutral trend', () => {
    render(
      <StatCard 
        title="Total Assets" 
        value={42} 
        trend={{ value: 0, label: 'vs last month' }}
      />
    );
    
    const trendText = screen.getByText('0% vs last month');
    expect(trendText).toBeInTheDocument();
  });

  it('should render all props together', () => {
    const { container } = render(
      <StatCard 
        title="Total Assets" 
        value={42} 
        subtitle="Across all locations"
        icon={<HomeIcon data-testid="home-icon" />}
        color="#2196f3"
        trend={{ value: 5.5, label: 'growth' }}
      />
    );
    
    expect(screen.getByText('Total Assets')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Across all locations')).toBeInTheDocument();
    expect(screen.getByTestId('home-icon')).toBeInTheDocument();
    expect(screen.getByText('+5.5% growth')).toBeInTheDocument();
    
    const valueElement = screen.getByText('42');
    expect(valueElement).toHaveStyle({ color: 'rgb(33, 150, 243)' });
  });
});