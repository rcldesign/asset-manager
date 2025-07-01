import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { OfflineIndicator } from '../OfflineIndicator';

describe('OfflineIndicator', () => {
  let onlineGetter: jest.SpyInstance;
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock navigator.onLine
    onlineGetter = jest.spyOn(navigator, 'onLine', 'get');
    
    // Mock window event listeners
    addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should not show offline indicator when online', () => {
    onlineGetter.mockReturnValue(true);
    
    render(<OfflineIndicator />);
    
    // The offline chip should not be visible
    const offlineChip = screen.queryByText('Offline Mode');
    expect(offlineChip).not.toBeInTheDocument();
  });

  it('should show offline indicator when offline', () => {
    onlineGetter.mockReturnValue(false);
    
    render(<OfflineIndicator />);
    
    // The offline chip should be visible
    const offlineChip = screen.getByText('Offline Mode');
    expect(offlineChip).toBeInTheDocument();
  });

  it('should register online and offline event listeners', () => {
    render(<OfflineIndicator />);
    
    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('should clean up event listeners on unmount', () => {
    const { unmount } = render(<OfflineIndicator />);
    
    unmount();
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('should show notification when going offline', async () => {
    onlineGetter.mockReturnValue(true);
    
    render(<OfflineIndicator />);
    
    // Get the offline event handler
    const offlineHandler = addEventListenerSpy.mock.calls.find(
      call => call[0] === 'offline'
    )?.[1];
    
    // Trigger offline event
    act(() => {
      onlineGetter.mockReturnValue(false);
      offlineHandler?.();
    });
    
    // Check for offline notification
    await waitFor(() => {
      expect(screen.getByText(/You are offline/)).toBeInTheDocument();
    });
  });

  it('should show notification when going online', async () => {
    onlineGetter.mockReturnValue(false);
    
    render(<OfflineIndicator />);
    
    // Get the online event handler
    const onlineHandler = addEventListenerSpy.mock.calls.find(
      call => call[0] === 'online'
    )?.[1];
    
    // Trigger online event
    act(() => {
      onlineGetter.mockReturnValue(true);
      onlineHandler?.();
    });
    
    // Check for online notification
    await waitFor(() => {
      expect(screen.getByText(/You are back online/)).toBeInTheDocument();
    });
  });

  it('should handle SSR properly', () => {
    // Mock window as undefined for SSR
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    
    expect(() => render(<OfflineIndicator />)).not.toThrow();
    
    // Restore window
    global.window = originalWindow;
  });
});