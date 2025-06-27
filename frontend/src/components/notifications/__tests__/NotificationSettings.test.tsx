import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import NotificationSettings from '../NotificationSettings';

// Mock the hooks
vi.mock('../../../hooks/use-notification-settings', () => ({
  useNotificationSettings: () => ({
    data: {
      preferences: {
        email: {
          enabled: true,
          taskAssigned: true,
          taskDue: false,
          taskOverdue: true,
          assetWarrantyExpiring: false,
          scheduleChanged: true,
          mentioned: true,
        },
        push: {
          enabled: false,
          taskAssigned: false,
          taskDue: false,
          taskOverdue: false,
          assetWarrantyExpiring: false,
          scheduleChanged: false,
          mentioned: false,
        },
        apprise: {
          enabled: false,
          urls: [],
        },
        webhooks: {
          enabled: false,
        },
      },
      pushSubscription: null,
    },
    isLoading: false,
  }),
  useUpdateNotificationSettings: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    error: null,
    isError: false,
  }),
  useTestNotificationSettings: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('NotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all notification tabs', () => {
    render(<NotificationSettings />, { wrapper });

    expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Push')).toBeInTheDocument();
    expect(screen.getByText('Apprise')).toBeInTheDocument();
  });

  it('displays email notification settings', () => {
    render(<NotificationSettings />, { wrapper });

    expect(screen.getByText('Enable Email Notifications')).toBeInTheDocument();
    expect(screen.getByText('Task Assigned')).toBeInTheDocument();
    expect(screen.getByText('Task Due')).toBeInTheDocument();
    expect(screen.getByText('Task Overdue')).toBeInTheDocument();
    expect(screen.getByText('Warranty Expiring')).toBeInTheDocument();
    expect(screen.getByText('Schedule Changed')).toBeInTheDocument();
    expect(screen.getByText('Mentioned')).toBeInTheDocument();
  });

  it('switches between tabs', async () => {
    render(<NotificationSettings />, { wrapper });

    const pushTab = screen.getByRole('tab', { name: /Push/i });
    fireEvent.click(pushTab);

    await waitFor(() => {
      expect(screen.getByText('Enable Push Notifications')).toBeInTheDocument();
    });

    const appriseTab = screen.getByRole('tab', { name: /Apprise/i });
    fireEvent.click(appriseTab);

    await waitFor(() => {
      expect(screen.getByText('Enable Apprise Notifications')).toBeInTheDocument();
    });
  });

  it('allows toggling notification types', async () => {
    const mockUpdateSettings = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateNotificationSettings).mockReturnValue({
      mutateAsync: mockUpdateSettings,
      isPending: false,
      error: null,
      isError: false,
    } as any);

    render(<NotificationSettings />, { wrapper });

    const taskDueSwitch = screen.getAllByRole('checkbox')[2]; // Task Due switch
    fireEvent.click(taskDueSwitch);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        email: expect.objectContaining({
          taskDue: true,
        }),
      });
    });
  });

  it('shows test button for enabled channels', () => {
    render(<NotificationSettings />, { wrapper });

    const testButton = screen.getByText('Test Email Notifications');
    expect(testButton).toBeInTheDocument();
    expect(testButton).not.toBeDisabled();
  });

  it('disables notification type switches when channel is disabled', () => {
    vi.mocked(useNotificationSettings).mockReturnValue({
      data: {
        preferences: {
          email: {
            enabled: false,
            taskAssigned: false,
            taskDue: false,
            taskOverdue: false,
            assetWarrantyExpiring: false,
            scheduleChanged: false,
            mentioned: false,
          },
          push: {
            enabled: false,
            taskAssigned: false,
            taskDue: false,
            taskOverdue: false,
            assetWarrantyExpiring: false,
            scheduleChanged: false,
            mentioned: false,
          },
          apprise: {
            enabled: false,
            urls: [],
          },
          webhooks: {
            enabled: false,
          },
        },
        pushSubscription: null,
      },
      isLoading: false,
    } as any);

    render(<NotificationSettings />, { wrapper });

    const notificationTypeSwitches = screen.getAllByRole('checkbox').slice(1); // Skip the enable switch
    notificationTypeSwitches.forEach(switchElement => {
      expect(switchElement).toBeDisabled();
    });
  });

  it('handles Apprise URL configuration', async () => {
    render(<NotificationSettings />, { wrapper });

    const appriseTab = screen.getByRole('tab', { name: /Apprise/i });
    fireEvent.click(appriseTab);

    await waitFor(() => {
      const urlTextarea = screen.getByPlaceholderText(/discord:\/\/webhook_id/i);
      expect(urlTextarea).toBeInTheDocument();
    });

    const urlTextarea = screen.getByPlaceholderText(/discord:\/\/webhook_id/i);
    fireEvent.change(urlTextarea, { 
      target: { value: 'discord://webhook_id/webhook_token' } 
    });

    const saveButton = screen.getByText('Save URLs');
    expect(saveButton).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(useNotificationSettings).mockReturnValue({
      data: null,
      isLoading: true,
    } as any);

    render(<NotificationSettings />, { wrapper });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows error message on save failure', async () => {
    vi.mocked(useUpdateNotificationSettings).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Failed to save')),
      isPending: false,
      error: new Error('Failed to save'),
      isError: true,
    } as any);

    render(<NotificationSettings />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Failed to save notification settings/i)).toBeInTheDocument();
    });
  });
});