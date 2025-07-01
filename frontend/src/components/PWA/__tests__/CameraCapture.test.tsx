import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CameraCapture } from '../CameraCapture';

// Mock MediaDevices API
const mockGetUserMedia = jest.fn();
const mockEnumerateDevices = jest.fn();

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices,
  },
  writable: true,
});

// Mock canvas and video elements
const mockCanvas = {
  getContext: jest.fn(() => ({
    drawImage: jest.fn(),
  })),
  toBlob: jest.fn((callback) => {
    callback(new Blob(['fake-image-data'], { type: 'image/jpeg' }));
  }),
  toDataURL: jest.fn(() => 'data:image/jpeg;base64,fake-data'),
  width: 640,
  height: 480,
};

const mockVideo = {
  play: jest.fn(),
  pause: jest.fn(),
  srcObject: null,
  videoWidth: 640,
  videoHeight: 480,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Mock createElement to return our mock elements
const originalCreateElement = document.createElement;
document.createElement = jest.fn((tagName) => {
  if (tagName === 'canvas') return mockCanvas as any;
  if (tagName === 'video') return mockVideo as any;
  return originalCreateElement.call(document, tagName);
});

describe('CameraCapture', () => {
  const mockStream = {
    getTracks: jest.fn(() => [
      { stop: jest.fn(), kind: 'video', label: 'Camera 1' },
    ]),
    getVideoTracks: jest.fn(() => [
      { stop: jest.fn(), getSettings: jest.fn(() => ({ deviceId: 'camera1' })) },
    ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGetUserMedia.mockResolvedValue(mockStream);
    mockEnumerateDevices.mockResolvedValue([
      { deviceId: 'camera1', kind: 'videoinput', label: 'Camera 1' },
      { deviceId: 'camera2', kind: 'videoinput', label: 'Camera 2' },
    ]);
  });

  afterAll(() => {
    document.createElement = originalCreateElement;
  });

  it('should render camera capture component', () => {
    render(<CameraCapture />);

    expect(screen.getByTestId('camera-capture')).toBeInTheDocument();
    expect(screen.getByTestId('start-camera-button')).toBeInTheDocument();
  });

  it('should start camera when start button clicked', async () => {
    const user = userEvent.setup();
    render(<CameraCapture />);

    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
      audio: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId('camera-preview')).toBeInTheDocument();
    });
  });

  it('should handle camera permission denied', async () => {
    const user = userEvent.setup();
    mockGetUserMedia.mockRejectedValue(new Error('Permission denied'));

    render(<CameraCapture />);

    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByTestId('camera-error')).toBeInTheDocument();
      expect(screen.getByText(/Permission denied/)).toBeInTheDocument();
    });
  });

  it('should capture photo when capture button clicked', async () => {
    const user = userEvent.setup();
    const onCaptureMock = jest.fn();

    render(<CameraCapture onCapture={onCaptureMock} />);

    // Start camera first
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByTestId('capture-button')).toBeInTheDocument();
    });

    const captureButton = screen.getByTestId('capture-button');
    await user.click(captureButton);

    expect(onCaptureMock).toHaveBeenCalledWith(
      expect.any(Blob),
      'data:image/jpeg;base64,fake-data'
    );
  });

  it('should stop camera when stop button clicked', async () => {
    const user = userEvent.setup();
    render(<CameraCapture />);

    // Start camera first
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(() => {
      const stopButton = screen.getByTestId('stop-camera-button');
      return user.click(stopButton);
    });

    expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
  });

  it('should switch between cameras', async () => {
    const user = userEvent.setup();
    render(<CameraCapture />);

    // Start camera first
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByTestId('camera-selector')).toBeInTheDocument();
    });

    const cameraSelector = screen.getByTestId('camera-selector');
    await user.selectOptions(cameraSelector, 'camera2');

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: { deviceId: { exact: 'camera2' } },
      audio: false,
    });
  });

  it('should handle flash/torch toggle', async () => {
    const user = userEvent.setup();
    const mockTrack = {
      getCapabilities: jest.fn(() => ({ torch: true })),
      applyConstraints: jest.fn(),
    };

    mockStream.getVideoTracks.mockReturnValue([mockTrack]);

    render(<CameraCapture enableFlash={true} />);

    // Start camera first
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByTestId('flash-toggle')).toBeInTheDocument();
    });

    const flashToggle = screen.getByTestId('flash-toggle');
    await user.click(flashToggle);

    expect(mockTrack.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });
  });

  it('should support different camera modes', async () => {
    const user = userEvent.setup();
    render(<CameraCapture cameraMode="selfie" />);

    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: false,
    });
  });

  it('should handle zoom controls', async () => {
    const user = userEvent.setup();
    const mockTrack = {
      getCapabilities: jest.fn(() => ({ zoom: { min: 1, max: 3, step: 0.1 } })),
      applyConstraints: jest.fn(),
    };

    mockStream.getVideoTracks.mockReturnValue([mockTrack]);

    render(<CameraCapture enableZoom={true} />);

    // Start camera first
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByTestId('zoom-slider')).toBeInTheDocument();
    });

    const zoomSlider = screen.getByTestId('zoom-slider');
    fireEvent.change(zoomSlider, { target: { value: '2' } });

    expect(mockTrack.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ zoom: 2 }],
    });
  });

  it('should capture with custom quality settings', async () => {
    const user = userEvent.setup();
    const onCaptureMock = jest.fn();

    render(
      <CameraCapture 
        onCapture={onCaptureMock}
        captureQuality={0.8}
        captureFormat="image/png"
      />
    );

    // Start camera and capture
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(async () => {
      const captureButton = screen.getByTestId('capture-button');
      await user.click(captureButton);
    });

    expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', 0.8);
  });

  it('should handle video recording', async () => {
    const user = userEvent.setup();
    const onRecordingMock = jest.fn();

    // Mock MediaRecorder
    const mockMediaRecorder = {
      start: jest.fn(),
      stop: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      state: 'inactive',
      ondataavailable: null,
      onstop: null,
    };

    (global as any).MediaRecorder = jest.fn(() => mockMediaRecorder);
    (global as any).MediaRecorder.isTypeSupported = jest.fn(() => true);

    render(
      <CameraCapture 
        enableVideoRecording={true}
        onRecording={onRecordingMock}
      />
    );

    // Start camera first
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByTestId('record-button')).toBeInTheDocument();
    });

    const recordButton = screen.getByTestId('record-button');
    await user.click(recordButton);

    expect(mockMediaRecorder.start).toHaveBeenCalled();
  });

  it('should show capture preview', async () => {
    const user = userEvent.setup();
    render(<CameraCapture showPreview={true} />);

    // Start camera and capture
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(async () => {
      const captureButton = screen.getByTestId('capture-button');
      await user.click(captureButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId('capture-preview')).toBeInTheDocument();
    });
  });

  it('should handle retake functionality', async () => {
    const user = userEvent.setup();
    render(<CameraCapture showPreview={true} />);

    // Start camera, capture, then retake
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(async () => {
      const captureButton = screen.getByTestId('capture-button');
      await user.click(captureButton);
    });

    await waitFor(async () => {
      const retakeButton = screen.getByTestId('retake-button');
      await user.click(retakeButton);
    });

    expect(screen.getByTestId('camera-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('capture-preview')).not.toBeInTheDocument();
  });

  it('should handle save functionality', async () => {
    const user = userEvent.setup();
    const onSaveMock = jest.fn();

    render(
      <CameraCapture 
        showPreview={true}
        onSave={onSaveMock}
      />
    );

    // Start camera, capture, then save
    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(async () => {
      const captureButton = screen.getByTestId('capture-button');
      await user.click(captureButton);
    });

    await waitFor(async () => {
      const saveButton = screen.getByTestId('save-button');
      await user.click(saveButton);
    });

    expect(onSaveMock).toHaveBeenCalled();
  });

  it('should handle error states gracefully', async () => {
    const user = userEvent.setup();
    mockGetUserMedia.mockRejectedValue(new Error('Camera not found'));

    render(<CameraCapture />);

    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    await waitFor(() => {
      expect(screen.getByTestId('camera-error')).toBeInTheDocument();
      expect(screen.getByText(/Camera not found/)).toBeInTheDocument();
    });
  });

  it('should cleanup resources on unmount', () => {
    const { unmount } = render(<CameraCapture />);

    unmount();

    // Should have stopped any active streams
    expect(mockVideo.removeEventListener).toHaveBeenCalled();
  });

  it('should support custom resolution', async () => {
    const user = userEvent.setup();
    render(
      <CameraCapture 
        resolution={{ width: 1920, height: 1080 }}
      />
    );

    const startButton = screen.getByTestId('start-camera-button');
    await user.click(startButton);

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  });

  it('should handle loading states', () => {
    render(<CameraCapture />);

    // Should show loading when starting camera
    const startButton = screen.getByTestId('start-camera-button');
    fireEvent.click(startButton);

    expect(screen.getByTestId('camera-loading')).toBeInTheDocument();
  });

  it('should support custom styling', () => {
    render(
      <CameraCapture 
        className="custom-camera"
        style={{ backgroundColor: 'black' }}
      />
    );

    const cameraComponent = screen.getByTestId('camera-capture');
    expect(cameraComponent).toHaveClass('custom-camera');
    expect(cameraComponent).toHaveStyle({ backgroundColor: 'black' });
  });

  it('should handle keyboard shortcuts', async () => {
    const onCaptureMock = jest.fn();
    render(<CameraCapture onCapture={onCaptureMock} />);

    // Start camera first
    const startButton = screen.getByTestId('start-camera-button');
    fireEvent.click(startButton);

    await waitFor(() => {
      // Simulate space key for capture
      fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    });

    expect(onCaptureMock).toHaveBeenCalled();
  });
});