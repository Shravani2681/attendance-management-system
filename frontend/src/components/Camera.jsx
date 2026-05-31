import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera as CameraIcon, RefreshCw, X } from 'lucide-react';

const Camera = ({ onCapture, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopStream(); // stop any previous stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setReady(true);
      setError('');
    } catch (err) {
      setError('Could not access camera. Please check permissions.');
    }
  }, [stopStream]);

  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
    };
  }, [startCamera, stopStream]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Compress to JPEG to save storage space
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    
    // Stop stream immediately so camera light turns off
    stopStream();
    
    // Notify parent — parent will unmount us via setShowCamera(false)
    onCapture(imageBase64);
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      
      <div className="camera-container">
        {error ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
            <p>{error}</p>
            <button className="btn mt-4" onClick={startCamera}>
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        )}
        
        {!error && (
          <div className="camera-controls">
            <button className="capture-btn" onClick={handleCapture} aria-label="Capture photo" />
          </div>
        )}
        
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <button 
        onClick={handleClose} 
        style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.5rem' }}
      >
        <X size={24} />
      </button>

      <p style={{ color: 'white', marginTop: '1rem', textAlign: 'center' }}>
        Please ensure your face is clearly visible.
      </p>
    </div>
  );
};

export default Camera;
