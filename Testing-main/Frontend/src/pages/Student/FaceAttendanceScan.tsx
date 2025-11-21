import React, { useRef, useState, useEffect } from "react";
import { Camera, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";

const FaceAttendanceScan: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [showCamera, setShowCamera] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setResult(null);
      setShowCamera(true);
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
      toast({
        title: "Camera Error",
        description: "Camera access denied. Please allow camera access.",
        variant: "destructive",
      });
      setShowCamera(false);
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
    setShowCamera(false);
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
      toast({
        title: "Error",
        description: "Failed to capture photo",
        variant: "destructive",
      });
    }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    setResult(null);
    startCamera();
  };

  const submitAttendance = async () => {
    if (!capturedPhoto || !user?.rollNo) {
      toast({
        title: "Error",
        description: "Photo or student ID missing",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/face-attendance/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          student_id: user.rollNo,
          today_photo: capturedPhoto,
        }),
      });

      const data = await response.json();

      if (response.ok && data.match) {
        setResult({
          success: true,
          message: data.message || "Attendance marked successfully!",
        });
        setCapturedPhoto(null);
        toast({
          title: "Success!",
          description: `Attendance marked with ${(data.confidence * 100).toFixed(1)}% confidence`,
        });
      } else {
        setResult({
          success: false,
          message: data.message || "Face mismatch — try again",
        });
        toast({
          title: "Face Mismatch",
          description: data.message || "Please try again with better lighting",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Attendance scan error:", error);
      setResult({
        success: false,
        message: "Server error. Please try again.",
      });
      toast({
        title: "Error",
        description: "Failed to process attendance",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user || user.role !== "student") {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">Access denied. Student login required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Face Recognition Attendance</h2>
        <p className="text-muted-foreground">
          Scan your face to mark your daily attendance
        </p>
      </div>

      <div className="glass p-6 rounded-xl">
        {!showCamera && !capturedPhoto && (
          <div className="text-center space-y-4">
            <Camera className="h-16 w-16 mx-auto text-primary" />
            <p className="text-muted-foreground">
              Click the button below to open your camera and capture your photo for attendance
            </p>
            <Button
              onClick={startCamera}
              size="lg"
              className="w-full sm:w-auto"
            >
              <Camera className="h-5 w-5 mr-2" />
              Scan Face for Attendance
            </Button>
          </div>
        )}

        {showCamera && !capturedPhoto && (
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
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
                Capture Photo
              </Button>
              <Button
                onClick={stopCamera}
                variant="outline"
                size="lg"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {capturedPhoto && (
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <img
                src={capturedPhoto}
                alt="Captured"
                className="w-full h-auto"
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={submitAttendance}
                className="flex-1"
                size="lg"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Submit Attendance
                  </>
                )}
              </Button>
              <Button
                onClick={retakePhoto}
                variant="outline"
                size="lg"
                disabled={isProcessing}
              >
                Retake
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className={`mt-4 p-4 rounded-xl ${
            result.success 
              ? "bg-green-500/10 border border-green-500/20" 
              : "bg-red-500/10 border border-red-500/20"
          }`}>
            <div className="flex items-center space-x-3">
              {result.success ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600" />
              )}
              <div>
                <p className="font-bold">{result.success ? "Success!" : "Failed"}</p>
                <p className="text-sm">{result.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="glass p-4 rounded-xl">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold mb-1">Tips for best results:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Ensure good lighting on your face</li>
              <li>Look directly at the camera</li>
              <li>Remove glasses or hat if possible</li>
              <li>Keep a neutral expression</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaceAttendanceScan;

