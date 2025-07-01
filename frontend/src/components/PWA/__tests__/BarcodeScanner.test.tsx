import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BarcodeScanner } from '../BarcodeScanner';

// Mock MediaStream
class MockMediaStream {
  getTracks() {
    return [{ stop: jest.fn() }];
  }
}

describe('BarcodeScanner', () => {
  let mockGetUserMedia: jest.Mock;
  const mockOnScan = jest.fn();
  
  beforeEach(() => {
    // Mock getUserMedia
    mockGetUserMedia = jest.fn().mockResolvedValue(new MockMediaStream());
    
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: mockGetUserMedia,
      },
    });
    
    // Mock canvas context
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
      drawImage: jest.fn(),
      getImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray() }),
    });
    
    // Mock video element
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      get: () => 1280,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      get: () => 720,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
      get: () => 4, // HAVE_ENOUGH_DATA
    });
    
    // Reset mocks
    mockOnScan.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
  });

  it('should render scan button', () => {
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    expect(button).toBeInTheDocument();
  });

  it('should render with custom button text', () => {
    render(<BarcodeScanner onScan={mockOnScan} buttonText="Scan QR Code" />);
    
    const button = screen.getByRole('button', { name: /scan qr code/i });
    expect(button).toBeInTheDocument();
  });

  it('should open scanner dialog when button is clicked', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    expect(screen.getByText('Scan Barcode')).toBeInTheDocument();
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  });

  it('should show manual input option', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    const manualInputButton = screen.getByRole('button', { name: /manual input/i });
    expect(manualInputButton).toBeInTheDocument();
  });

  it('should toggle manual input when button is clicked', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    const manualInputButton = screen.getByRole('button', { name: /manual input/i });
    await user.click(manualInputButton);
    
    expect(screen.getByLabelText(/enter barcode/i)).toBeInTheDocument();
  });

  it('should submit manual barcode entry', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    const manualInputButton = screen.getByRole('button', { name: /manual input/i });
    await user.click(manualInputButton);
    
    const input = screen.getByLabelText(/enter barcode/i);
    await user.type(input, '123456789');
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);
    
    // Should show confirmation
    expect(screen.getByText('Barcode Detected')).toBeInTheDocument();
    expect(screen.getByText('123456789')).toBeInTheDocument();
  });

  it('should not submit empty barcode', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    const manualInputButton = screen.getByRole('button', { name: /manual input/i });
    await user.click(manualInputButton);
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeDisabled();
  });

  it('should call onScan when barcode is confirmed', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    const manualInputButton = screen.getByRole('button', { name: /manual input/i });
    await user.click(manualInputButton);
    
    const input = screen.getByLabelText(/enter barcode/i);
    await user.type(input, '123456789');
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);
    
    const useButton = screen.getByRole('button', { name: /use this code/i });
    await user.click(useButton);
    
    expect(mockOnScan).toHaveBeenCalledWith('123456789');
  });

  it('should allow retry after scanning', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    const manualInputButton = screen.getByRole('button', { name: /manual input/i });
    await user.click(manualInputButton);
    
    const input = screen.getByLabelText(/enter barcode/i);
    await user.type(input, '123456789');
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    await user.click(retryButton);
    
    // Should go back to scanning
    expect(screen.queryByText('Barcode Detected')).not.toBeInTheDocument();
  });

  it('should show error when camera permission is denied', async () => {
    const user = userEvent.setup();
    mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/camera permission denied/i)).toBeInTheDocument();
    });
  });

  it('should show error when no camera is found', async () => {
    const user = userEvent.setup();
    mockGetUserMedia.mockRejectedValue(new DOMException('No camera found', 'NotFoundError'));
    
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/no camera found/i)).toBeInTheDocument();
    });
  });

  it('should close dialog when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    const closeButton = screen.getByRole('button', { name: '' }); // Icon button
    await user.click(closeButton);
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should stop camera stream when dialog is closed', async () => {
    const user = userEvent.setup();
    const mockStop = jest.fn();
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    };
    mockGetUserMedia.mockResolvedValue(mockStream);
    
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });
    
    const closeButton = screen.getByRole('button', { name: '' });
    await user.click(closeButton);
    
    expect(mockStop).toHaveBeenCalled();
  });

  it('should display supported formats', async () => {
    const user = userEvent.setup();
    const customFormats = ['QR_CODE', 'EAN13'];
    
    render(
      <BarcodeScanner 
        onScan={mockOnScan} 
        supportedFormats={customFormats}
      />
    );
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    expect(screen.getByText(/supported formats: qr_code, ean13/i)).toBeInTheDocument();
  });

  it('should handle missing camera API gracefully', async () => {
    const user = userEvent.setup();
    
    // Remove mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: undefined,
    });
    
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/camera api is not supported/i)).toBeInTheDocument();
    });
  });

  it('should handle Enter key in manual input', async () => {
    const user = userEvent.setup();
    render(<BarcodeScanner onScan={mockOnScan} />);
    
    const button = screen.getByRole('button', { name: /scan barcode/i });
    await user.click(button);
    
    const manualInputButton = screen.getByRole('button', { name: /manual input/i });
    await user.click(manualInputButton);
    
    const input = screen.getByLabelText(/enter barcode/i);
    await user.type(input, '123456789');
    await user.keyboard('{Enter}');
    
    // Should show confirmation
    expect(screen.getByText('Barcode Detected')).toBeInTheDocument();
    expect(screen.getByText('123456789')).toBeInTheDocument();
  });
});