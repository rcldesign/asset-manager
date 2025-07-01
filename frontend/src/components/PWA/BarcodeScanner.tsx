'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  Alert,
  TextField,
  Typography,
  Chip,
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardIcon from '@mui/icons-material/Keyboard';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  buttonText?: string;
  supportedFormats?: string[];
  customTrigger?: React.ReactNode;
  open?: boolean;
  onClose?: () => void;
}

// We'll use a simple fallback scanner that uses camera + manual input
// For production, you'd want to integrate a proper barcode scanning library
// like @zxing/library or quagga2
export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan,
  buttonText = 'Scan Barcode',
  supportedFormats = ['CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC', 'QR_CODE'],
  customTrigger,
  open: externalOpen,
  onClose: externalOnClose,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser');
      }

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setHasPermission(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setIsScanning(true);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setHasPermission(false);
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access or use manual input.');
          setShowManualInput(true);
        } else if (err.name === 'NotFoundError') {
          setError('No camera found. Please use manual input.');
          setShowManualInput(true);
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to access camera');
      }
    }
  }, [stream]);

  // Simulated barcode detection (in production, use a real barcode library)
  const detectBarcode = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // In a real implementation, you would use a barcode detection library here
      // For demo purposes, we'll show a message about needing manual input
      // Example with @zxing/library:
      // const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      // const result = await barcodeReader.decodeFromImageData(imageData);
    }
  }, [isScanning]);

  useEffect(() => {
    if (isScanning && !scanIntervalRef.current) {
      // Start scanning every 100ms
      scanIntervalRef.current = setInterval(detectBarcode, 100);
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [isScanning, detectBarcode]);

  const handleOpen = () => {
    if (externalOpen === undefined) {
      setInternalOpen(true);
    }
    setScannedCode(null);
    setManualInput('');
    setShowManualInput(false);
    startCamera();
  };

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsScanning(false);
    if (externalOpen === undefined) {
      setInternalOpen(false);
    } else {
      externalOnClose?.();
    }
    setError(null);
    setShowManualInput(false);
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      setScannedCode(manualInput.trim());
    }
  };

  const handleConfirmScan = () => {
    if (scannedCode) {
      onScan(scannedCode);
      handleClose();
    }
  };

  return (
    <>
      {customTrigger ? (
        React.cloneElement(customTrigger as React.ReactElement, {
          onClick: handleOpen,
        })
      ) : (
        <Button
          variant="outlined"
          startIcon={<QrCodeScannerIcon />}
          onClick={handleOpen}
        >
          {buttonText}
        </Button>
      )}

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <span>Scan Barcode</span>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {!scannedCode && (
            <>
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  height: 300,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: 'black',
                  mb: 2,
                  overflow: 'hidden',
                }}
              >
                {!showManualInput && hasPermission !== false && (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <canvas
                      ref={canvasRef}
                      style={{ display: 'none' }}
                    />
                    
                    {/* Scanning overlay */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '80%',
                        height: '50%',
                        border: '2px solid',
                        borderColor: 'primary.main',
                        borderRadius: 1,
                        pointerEvents: 'none',
                      }}
                    >
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: 2,
                          backgroundColor: 'primary.main',
                          animation: 'scan 2s linear infinite',
                        }}
                      />
                    </Box>

                    <Typography
                      variant="caption"
                      sx={{
                        position: 'absolute',
                        bottom: 10,
                        color: 'white',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        px: 2,
                        py: 0.5,
                        borderRadius: 1,
                      }}
                    >
                      Position barcode within frame
                    </Typography>
                  </>
                )}
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                For this demo, barcode scanning requires a barcode library integration. 
                Please use manual input below.
              </Alert>

              <Box sx={{ mb: 2 }}>
                <Button
                  fullWidth
                  variant={showManualInput ? 'contained' : 'outlined'}
                  startIcon={<KeyboardIcon />}
                  onClick={() => setShowManualInput(!showManualInput)}
                >
                  Manual Input
                </Button>
              </Box>

              {showManualInput && (
                <Box sx={{ mb: 2 }}>
                  <TextField
                    fullWidth
                    label="Enter Barcode"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleManualSubmit();
                      }
                    }}
                    placeholder="Enter barcode number"
                    autoFocus
                  />
                </Box>
              )}
            </>
          )}

          {scannedCode && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Barcode Detected
              </Typography>
              <Chip
                label={scannedCode}
                color="primary"
                sx={{ fontSize: '1.2rem', py: 3, px: 2 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Is this correct?
              </Typography>
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Supported formats: {supportedFormats.join(', ')}
          </Typography>
        </DialogContent>
        
        <DialogActions>
          {!scannedCode && showManualInput && (
            <Button
              onClick={handleManualSubmit}
              variant="contained"
              disabled={!manualInput.trim()}
            >
              Submit
            </Button>
          )}
          
          {scannedCode && (
            <>
              <Button onClick={() => setScannedCode(null)}>
                Retry
              </Button>
              <Button onClick={handleConfirmScan} variant="contained">
                Use This Code
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <style jsx global>{`
        @keyframes scan {
          0% {
            top: 0;
          }
          100% {
            top: calc(100% - 2px);
          }
        }
      `}</style>
    </>
  );
};