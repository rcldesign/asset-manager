import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityFeed } from '../ActivityFeed';

// Mock the date formatting
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn((date) => `${Math.floor((Date.now() - date.getTime()) / 60000)} minutes ago`),
  format: jest.fn((date) => '2024-01-15 10:30:00'),
}));

describe('ActivityFeed', () => {
  const mockActivities = [
    {
      id: '1',
      type: 'task_completed',
      title: 'Completed maintenance task',
      description: 'Monthly server maintenance completed successfully',
      userName: 'John Doe',
      timestamp: new Date('2024-01-15T10:30:00Z'),
      metadata: {
        assetName: 'Server-001',
        taskId: 'task-123',
      },
    },
    {
      id: '2',
      type: 'asset_added',
      title: 'New asset added',
      description: 'Added new laptop to inventory',
      userName: 'Jane Smith',
      timestamp: new Date('2024-01-15T09:45:00Z'),
      metadata: {
        assetName: 'Laptop-456',
        assetId: 'asset-456',
      },
    },
    {
      id: '3',
      type: 'user_login',
      title: 'User logged in',
      description: 'User accessed the system',
      userName: 'Bob Johnson',
      timestamp: new Date('2024-01-15T08:15:00Z'),
      metadata: {},
    },
  ];

  it('should render activity feed with activities', () => {
    render(<ActivityFeed activities={mockActivities} />);

    expect(screen.getByText('Completed maintenance task')).toBeInTheDocument();
    expect(screen.getByText('New asset added')).toBeInTheDocument();
    expect(screen.getByText('User logged in')).toBeInTheDocument();

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
  });

  it('should render loading state', () => {
    render(<ActivityFeed activities={[]} loading={true} />);

    expect(screen.getByTestId('activity-feed-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('activity-skeleton')).toHaveLength(5);
  });

  it('should render empty state when no activities', () => {
    render(<ActivityFeed activities={[]} />);

    expect(screen.getByTestId('activity-feed-empty')).toBeInTheDocument();
    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('should render error state', () => {
    const errorMessage = 'Failed to load activities';
    render(<ActivityFeed activities={[]} error={errorMessage} />);

    expect(screen.getByTestId('activity-feed-error')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should display activity types with appropriate icons', () => {
    render(<ActivityFeed activities={mockActivities} />);

    // Check for activity type icons
    expect(screen.getByTestId('activity-icon-task_completed')).toBeInTheDocument();
    expect(screen.getByTestId('activity-icon-asset_added')).toBeInTheDocument();
    expect(screen.getByTestId('activity-icon-user_login')).toBeInTheDocument();
  });

  it('should show timestamps relative to now', () => {
    render(<ActivityFeed activities={mockActivities} />);

    // Mock returns "X minutes ago" format
    expect(screen.getByText(/minutes ago/)).toBeInTheDocument();
  });

  it('should handle click on activity item', () => {
    const onActivityClickMock = jest.fn();
    render(
      <ActivityFeed 
        activities={mockActivities} 
        onActivityClick={onActivityClickMock}
      />
    );

    const firstActivity = screen.getByTestId('activity-item-1');
    fireEvent.click(firstActivity);

    expect(onActivityClickMock).toHaveBeenCalledWith(mockActivities[0]);
  });

  it('should limit displayed activities', () => {
    const manyActivities = Array.from({ length: 20 }, (_, i) => ({
      ...mockActivities[0],
      id: `activity-${i}`,
      title: `Activity ${i}`,
    }));

    render(<ActivityFeed activities={manyActivities} maxItems={10} />);

    const activityItems = screen.getAllByTestId(/activity-item-/);
    expect(activityItems).toHaveLength(10);
  });

  it('should show "Load More" button when there are more activities', () => {
    const manyActivities = Array.from({ length: 20 }, (_, i) => ({
      ...mockActivities[0],
      id: `activity-${i}`,
      title: `Activity ${i}`,
    }));

    render(<ActivityFeed activities={manyActivities} maxItems={10} />);

    expect(screen.getByText('Load More')).toBeInTheDocument();
  });

  it('should load more activities when button clicked', () => {
    const manyActivities = Array.from({ length: 20 }, (_, i) => ({
      ...mockActivities[0],
      id: `activity-${i}`,
      title: `Activity ${i}`,
    }));

    render(<ActivityFeed activities={manyActivities} maxItems={10} />);

    const loadMoreButton = screen.getByText('Load More');
    fireEvent.click(loadMoreButton);

    const activityItems = screen.getAllByTestId(/activity-item-/);
    expect(activityItems).toHaveLength(20);
  });

  it('should filter activities by type', () => {
    render(
      <ActivityFeed 
        activities={mockActivities} 
        filterByType={['task_completed', 'asset_added']}
      />
    );

    expect(screen.getByText('Completed maintenance task')).toBeInTheDocument();
    expect(screen.getByText('New asset added')).toBeInTheDocument();
    expect(screen.queryByText('User logged in')).not.toBeInTheDocument();
  });

  it('should render activity descriptions when expanded', () => {
    render(<ActivityFeed activities={mockActivities} showDescriptions={true} />);

    expect(screen.getByText('Monthly server maintenance completed successfully')).toBeInTheDocument();
    expect(screen.getByText('Added new laptop to inventory')).toBeInTheDocument();
    expect(screen.getByText('User accessed the system')).toBeInTheDocument();
  });

  it('should handle refresh functionality', async () => {
    const onRefreshMock = jest.fn().mockResolvedValue(undefined);
    render(
      <ActivityFeed 
        activities={mockActivities} 
        onRefresh={onRefreshMock}
        showRefreshButton={true}
      />
    );

    const refreshButton = screen.getByTestId('refresh-activities');
    fireEvent.click(refreshButton);

    expect(onRefreshMock).toHaveBeenCalled();

    // Should show loading state during refresh
    await waitFor(() => {
      expect(screen.getByTestId('refreshing-indicator')).toBeInTheDocument();
    });
  });

  it('should render activity metadata', () => {
    render(<ActivityFeed activities={mockActivities} showMetadata={true} />);

    expect(screen.getByText('Server-001')).toBeInTheDocument();
    expect(screen.getByText('Laptop-456')).toBeInTheDocument();
  });

  it('should handle real-time updates', () => {
    const { rerender } = render(<ActivityFeed activities={mockActivities} />);

    const newActivity = {
      id: '4',
      type: 'task_created',
      title: 'New task created',
      description: 'Created quarterly review task',
      userName: 'Alice Cooper',
      timestamp: new Date(),
      metadata: {},
    };

    const updatedActivities = [newActivity, ...mockActivities];
    rerender(<ActivityFeed activities={updatedActivities} />);

    expect(screen.getByText('New task created')).toBeInTheDocument();
    expect(screen.getByText('Alice Cooper')).toBeInTheDocument();
  });

  it('should render with custom activity renderer', () => {
    const customRenderer = (activity: any) => (
      <div data-testid={`custom-activity-${activity.id}`}>
        Custom: {activity.title}
      </div>
    );

    render(
      <ActivityFeed 
        activities={mockActivities} 
        renderActivity={customRenderer}
      />
    );

    expect(screen.getByTestId('custom-activity-1')).toBeInTheDocument();
    expect(screen.getByText('Custom: Completed maintenance task')).toBeInTheDocument();
  });

  it('should handle keyboard navigation', () => {
    const onActivityClickMock = jest.fn();
    render(
      <ActivityFeed 
        activities={mockActivities} 
        onActivityClick={onActivityClickMock}
      />
    );

    const firstActivity = screen.getByTestId('activity-item-1');
    
    // Focus the activity item
    firstActivity.focus();
    expect(firstActivity).toHaveFocus();

    // Press Enter key
    fireEvent.keyDown(firstActivity, { key: 'Enter', code: 'Enter' });
    expect(onActivityClickMock).toHaveBeenCalledWith(mockActivities[0]);

    // Press Space key
    fireEvent.keyDown(firstActivity, { key: ' ', code: 'Space' });
    expect(onActivityClickMock).toHaveBeenCalledTimes(2);
  });

  it('should render activity priority indicators', () => {
    const activitiesWithPriority = mockActivities.map((activity, index) => ({
      ...activity,
      priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
    }));

    render(<ActivityFeed activities={activitiesWithPriority} showPriority={true} />);

    expect(screen.getByTestId('priority-indicator-high')).toBeInTheDocument();
    expect(screen.getByTestId('priority-indicator-medium')).toBeInTheDocument();
    expect(screen.getByTestId('priority-indicator-low')).toBeInTheDocument();
  });

  it('should handle search/filter functionality', () => {
    render(<ActivityFeed activities={mockActivities} searchable={true} />);

    const searchInput = screen.getByPlaceholderText('Search activities...');
    fireEvent.change(searchInput, { target: { value: 'maintenance' } });

    expect(screen.getByText('Completed maintenance task')).toBeInTheDocument();
    expect(screen.queryByText('New asset added')).not.toBeInTheDocument();
  });

  it('should render with grouped activities by date', () => {
    const activitiesWithDifferentDates = [
      {
        ...mockActivities[0],
        timestamp: new Date('2024-01-15T10:30:00Z'),
      },
      {
        ...mockActivities[1],
        timestamp: new Date('2024-01-14T09:45:00Z'),
      },
    ];

    render(
      <ActivityFeed 
        activities={activitiesWithDifferentDates} 
        groupByDate={true}
      />
    );

    expect(screen.getByTestId('date-group-2024-01-15')).toBeInTheDocument();
    expect(screen.getByTestId('date-group-2024-01-14')).toBeInTheDocument();
  });
});