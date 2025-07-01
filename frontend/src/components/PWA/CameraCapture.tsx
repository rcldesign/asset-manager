'use client';

import React, { useRef, useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  Alert,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import FlipCameraAndroidIcon from '@mui/icons-material/FlipCameraAndroid';
import CloseIcon from '@mui/icons-material/Close';

interface CameraCaptureProps {
  onCapture: (imageBlob: Blob, imageUrl: string) => void;
  buttonText?: string;
  maxSizeMB?: number;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  buttonText = 'Take Photo',
  maxSizeMB = 5,
}) => {
  const [open, setOpen] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      // Check if camera API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser');
      }

      // Stop any existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: isMobile ? 1280 : 1920 },
          height: { ideal: isMobile ? 720 : 1080 },
          // Mobile-specific optimizations
          frameRate: isMobile ? { ideal: 30, max: 30 } : { ideal: 60, max: 60 },
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setHasPermission(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setHasPermission(false);
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to access camera');
      }
    }
  }, [facingMode, stream]);

  const handleOpen = () => {
    setOpen(true);
    setCapturedImage(null);
    startCamera();
  };

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setOpen(false);
    setCapturedImage(null);
    setError(null);
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    startCamera();
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to data URL
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(imageDataUrl);
        
        // Stop camera stream
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          setStream(null);
        }
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const compressImage = async (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      img.onload = () => {
        let { width, height } = img;
        
        // Calculate new dimensions while maintaining aspect ratio
        const maxDimension = 1920;
        if (width > height && width > maxDimension) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        } else if (height > maxDimension) {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (compressedBlob) => {
              if (compressedBlob) {
                resolve(compressedBlob);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            0.8
          );
        } else {
          reject(new Error('Failed to get canvas context'));
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(blob);
    });
  };

  const savePhoto = async () => {
    if (capturedImage) {
      setIsProcessing(true);
      try {
        // Convert data URL to blob
        const response = await fetch(capturedImage);
        let blob = await response.blob();
        
        // Compress if needed
        const sizeMB = blob.size / (1024 * 1024);
        if (sizeMB > maxSizeMB) {
          blob = await compressImage(blob);
        }
        
        // Create object URL for the blob
        const imageUrl = URL.createObjectURL(blob);
        
        onCapture(blob, imageUrl);
        handleClose();
      } catch (err) {
        console.error('Error saving photo:', err);
        setError('Failed to save photo. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<CameraAltIcon />}
        onClick={handleOpen}
      >
        {buttonText}
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <span>Take Photo</span>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              height: isMobile ? 'calc(100vh - 120px)' : 'calc(100vh - 200px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'black',
              // Prevent scrolling on mobile
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            {!capturedImage && hasPermission !== false && (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
                <canvas
                  ref={canvasRef}
                  style={{ display: 'none' }}
                />
              </>
            )}
            
            {capturedImage && (
              <img
                src={capturedImage}
                alt="Captured"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            )}
            
            {hasPermission === false && !error && (
              <Alert severity="warning">
                Camera access is required to take photos. Please grant permission and try again.
              </Alert>
            )}
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ 
          justifyContent: 'center', 
          pb: isMobile ? 1 : 2,
          px: isMobile ? 1 : 3,
          gap: isMobile ? 1 : 2,
        }}>
          {!capturedImage && hasPermission === true && (
            <>
              <IconButton
                onClick={switchCamera}
                size={isMobile ? 'medium' : 'large'}
                sx={{
                  backgroundColor: 'action.selected',
                  minWidth: isMobile ? 48 : 56,
                  minHeight: isMobile ? 48 : 56,
                  '&:hover': { backgroundColor: 'action.hover' },
                  // Better touch target for mobile
                  '&:active': { 
                    transform: 'scale(0.95)',
                    transition: 'transform 0.1s ease',
                  },
                }}
              >
                <FlipCameraAndroidIcon />
              </IconButton>
              <IconButton
                onClick={capturePhoto}
                size={isMobile ? 'medium' : 'large'}
                sx={{
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  mx: isMobile ? 1 : 2,
                  minWidth: isMobile ? 64 : 72,
                  minHeight: isMobile ? 64 : 72,
                  transform: isMobile ? 'scale(1.2)' : 'scale(1.5)',
                  '&:hover': { backgroundColor: 'primary.dark' },
                  // Touch feedback
                  '&:active': { 
                    transform: isMobile ? 'scale(1.1)' : 'scale(1.4)',
                    transition: 'transform 0.1s ease',
                  },
                }}
              >
                <CameraAltIcon />
              </IconButton>
            </>
          )}
          
          {capturedImage && (
            <>
              <Button 
                onClick={retakePhoto} 
                size={isMobile ? 'medium' : 'large'}
                sx={{ 
                  minWidth: isMobile ? 80 : 100,
                  py: isMobile ? 1 : 1.5,
                }}
              >
                Retake
              </Button>
              <Button
                onClick={savePhoto}
                variant="contained"
                size={isMobile ? 'medium' : 'large'}
                disabled={isProcessing}
                startIcon={isProcessing ? <CircularProgress size={20} /> : undefined}
                sx={{ 
                  minWidth: isMobile ? 100 : 120,
                  py: isMobile ? 1 : 1.5,
                }}
              >
                {isProcessing ? 'Processing...' : 'Use Photo'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};