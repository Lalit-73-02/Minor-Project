import React, { useRef, useEffect, useState } from "react";
import { Camera, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoCaptureProps {
  onCapture: (photoData: string) => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  onCapture,
  onCancel,
  title = "Capture Photo",
  description = "Position your face in the frame and click capture",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false,
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error("Camera error:", error);
      alert("Camera access denied. Please allow camera access.");
      onCancel();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    try {
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const photoData = canvas.toDataURL("image/jpeg", 0.8);
        setCapturedPhoto(photoData);
        stopCamera();
      }
    } catch (error) {
      console.error("Error capturing photo:", error);
    }
  };

  const confirmPhoto = () => {
    if (capturedPhoto) {
      onCapture(capturedPhoto);
    }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-background rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>

        {!capturedPhoto ? (
          <>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video mb-4">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-3">
              <Button
                onClick={capturePhoto}
                className="flex-1"
                size="lg"
              >
                <Camera className="h-5 w-5 mr-2" />
                Capture
              </Button>
              <Button
                onClick={onCancel}
                variant="outline"
                size="lg"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="relative bg-black rounded-lg overflow-hidden mb-4">
              <img
                src={capturedPhoto}
                alt="Captured"
                className="w-full h-auto"
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={confirmPhoto}
                className="flex-1"
                size="lg"
                disabled={isCapturing}
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                {isCapturing ? "Saving..." : "Confirm"}
              </Button>
              <Button
                onClick={retakePhoto}
                variant="outline"
                size="lg"
                disabled={isCapturing}
              >
                Retake
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

