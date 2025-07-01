import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickActions } from '../QuickActions';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: mockPush,
    };
  },
}));

describe('QuickActions', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('should render the component title', () => {
    render(<QuickActions />);
    
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  it('should render all action buttons', () => {
    render(<QuickActions />);
    
    expect(screen.getByRole('button', { name: /new asset/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new schedule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /invite user/i })).toBeInTheDocument();
  });

  it('should navigate to new asset page when New Asset is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions />);
    
    const newAssetButton = screen.getByRole('button', { name: /new asset/i });
    await user.click(newAssetButton);
    
    expect(mockPush).toHaveBeenCalledWith('/assets/new');
  });

  it('should navigate to new task page when New Task is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions />);
    
    const newTaskButton = screen.getByRole('button', { name: /new task/i });
    await user.click(newTaskButton);
    
    expect(mockPush).toHaveBeenCalledWith('/tasks/new');
  });

  it('should navigate to schedules page when New Schedule is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions />);
    
    const newScheduleButton = screen.getByRole('button', { name: /new schedule/i });
    await user.click(newScheduleButton);
    
    expect(mockPush).toHaveBeenCalledWith('/schedules');
  });

  it('should navigate to users page when Invite User is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions />);
    
    const inviteUserButton = screen.getByRole('button', { name: /invite user/i });
    await user.click(inviteUserButton);
    
    expect(mockPush).toHaveBeenCalledWith('/users');
  });

  it('should render buttons with correct colors', () => {
    const { container } = render(<QuickActions />);
    
    const newAssetButton = screen.getByRole('button', { name: /new asset/i });
    const newTaskButton = screen.getByRole('button', { name: /new task/i });
    const newScheduleButton = screen.getByRole('button', { name: /new schedule/i });
    const inviteUserButton = screen.getByRole('button', { name: /invite user/i });
    
    // Check that buttons have the correct color classes
    expect(newAssetButton).toHaveClass('MuiButton-outlinedPrimary');
    expect(newTaskButton).toHaveClass('MuiButton-outlinedSuccess');
    expect(newScheduleButton).toHaveClass('MuiButton-outlinedWarning');
    expect(inviteUserButton).toHaveClass('MuiButton-outlinedInfo');
  });

  it('should render buttons with icons', () => {
    render(<QuickActions />);
    
    // Check that each button has an icon (startIcon creates a span before the text)
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      const iconSpan = button.querySelector('.MuiButton-startIcon');
      expect(iconSpan).toBeInTheDocument();
      expect(iconSpan?.querySelector('svg')).toBeInTheDocument();
    });
  });

  it('should render buttons as full width', () => {
    render(<QuickActions />);
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveClass('MuiButton-fullWidth');
    });
  });
});