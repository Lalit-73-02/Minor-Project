import React, { useEffect, useRef, useState } from "react";
import { MapPin, Wifi, CheckCircle, XCircle, AlertTriangle, Radio, Camera, User } from "lucide-react";
import { verifyLocation, verifyWiFi } from "../../utils/security";
import { useAuth } from "@/hooks/useAuth";

const BACKEND_URL = `http://${window.location.hostname}:5000`;

interface Student {
  id: number;
  name: string;
  email: string;
  role: string;
  rollNo?: string;
  department?: string;
  year?: string;
}

const QRScanner: React.FC = () => {
  const { user } = useAuth();
  const locationWatchId = useRef<number | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMarkedTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inRangeRef = useRef<boolean>(false);

  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [wifiStatus, setWifiStatus] = useState<boolean | null>(null);
  const [campusLocation, setCampusLocation] = useState<{ latitude: number; longitude: number; radius: number } | null>(null);
  const [loadingCampusLocation, setLoadingCampusLocation] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // New loading state for student data
  const [loadingStudent, setLoadingStudent] = useState(true);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);

  const fetchCurrentUser = async () => {
    if (!user?.id) {
      setCurrentStudent(null);
      setLoadingStudent(false);
      return;
    }

    setLoadingStudent(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/current-user/${user.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("No logged-in user");
      const data = await res.json();
      setCurrentStudent(data);
    } catch (err) {
      setCurrentStudent(null);
    }
    setLoadingStudent(false);
  };

  const fetchActiveQRLocation = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/qrcode/active`);
      const data = await res.json();

      if (!res.ok || !data.active || !data.qr) {
        setCampusLocation(null);
        return;
      }

      const record = data.qr;
      if (record.latitude && record.longitude && record.radius) {
        setCampusLocation({
          latitude: parseFloat(record.latitude),
          longitude: parseFloat(record.longitude),
          radius: parseInt(record.radius, 10),
        });
      } else {
        setCampusLocation(null);
      }
    } catch {
      setCampusLocation(null);
    } finally {
      setLoadingCampusLocation(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchActiveQRLocation();
    verifyWiFi().then((v) => setWifiStatus(Boolean(v)));

    return () => {
      if (locationWatchId.current !== null) {
        navigator.geolocation.clearWatch(locationWatchId.current);
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      stopCamera();
    };
    // eslint-disable-next-line
  }, []);

  const locationValid =
    location &&
    campusLocation &&
    verifyLocation(
      location.latitude,
      location.longitude,
      campusLocation.latitude,
      campusLocation.longitude,
      campusLocation.radius ?? 2000
    );

  // Start camera for verification
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setShowCamera(true);
      setCapturedPhoto(null);
    } catch (error) {
      console.error("Camera error:", error);
      setResult({ success: false, message: "Camera access denied. Please allow camera access to mark attendance." });
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
    setCapturedPhoto(null);
  };

  // Capture photo from camera
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const photoData = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedPhoto(photoData);
      setIsCapturing(true);
    }
  };

  // Mark attendance by location with camera verification
  const markAttendanceByLocation = async (photoData?: string) => {
    if (!currentStudent || !location) {
      return;
    }

    // Debounce: Don't mark if marked within last 30 seconds
    const now = Date.now();
    if (now - lastMarkedTimeRef.current < 30000) {
      return;
    }

    if (!photoData) {
      // If no photo, show camera for verification
      await startCamera();
      return;
    }

    try {
      // Send photo and location to backend
      const res = await fetch(`${BACKEND_URL}/api/qrcode/mark-by-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: currentStudent.rollNo,
          latitude: location.latitude,
          longitude: location.longitude,
          photo: photoData, // Base64 encoded photo
        }),
      });
      const data = await res.json();
      if (res.ok) {
        lastMarkedTimeRef.current = now;
        stopCamera();
        setCapturedPhoto(null);
        setIsCapturing(false);
        setResult({ success: true, message: data.message || "Attendance marked successfully!" });
        // Clear success message after 5 seconds
        setTimeout(() => setResult(null), 5000);
        inRangeRef.current = false;
      } else {
        setResult({ success: false, message: data.message || "Failed to mark attendance" });
        setIsCapturing(false);
      }
    } catch (err) {
      setResult({ success: false, message: "Server error. Please try again." });
      setIsCapturing(false);
    }
  };

  // Start real-time location tracking
  const startLocationTracking = () => {
    if (loadingStudent || !currentStudent) {
      setResult({ success: false, message: "Student data not loaded yet" });
      return;
    }

    if (!campusLocation) {
      setResult({ success: false, message: "No active attendance session found" });
      return;
    }

    if (!navigator.geolocation) {
      setResult({ success: false, message: "Geolocation not supported by your browser" });
      return;
    }

    setIsTracking(true);
    setResult(null);

    // Watch position for real-time updates
    locationWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setLocation(newLocation);

        // Check if in range
        const isInRange =
          campusLocation &&
          verifyLocation(
            newLocation.latitude,
            newLocation.longitude,
            campusLocation.latitude,
            campusLocation.longitude,
            campusLocation.radius ?? 2000
          );

        // If entered range and not already marked, show camera verification
        if (isInRange && !inRangeRef.current && !showCamera && !isCapturing) {
          inRangeRef.current = true;
          markAttendanceByLocation(); // This will trigger camera
        } else if (!isInRange) {
          inRangeRef.current = false;
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setResult({ success: false, message: "Location access denied. Please enable location services." });
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000, // Update every 5 seconds
      }
    );

    // Also check periodically (every 10 seconds) if in range
    checkIntervalRef.current = setInterval(() => {
      if (location && locationValid && isTracking && !showCamera && !isCapturing) {
        if (!inRangeRef.current) {
          markAttendanceByLocation(); // This will trigger camera if in range
        }
      }
    }, 10000);
  };

  // Stop location tracking
  const stopLocationTracking = () => {
    if (locationWatchId.current !== null) {
      navigator.geolocation.clearWatch(locationWatchId.current);
      locationWatchId.current = null;
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    stopCamera();
    setIsTracking(false);
    inRangeRef.current = false;
  };

  // Handle photo confirmation and mark attendance
  const confirmAndMark = () => {
    if (capturedPhoto) {
      markAttendanceByLocation(capturedPhoto);
    }
  };

  // Retake photo
  const retakePhoto = () => {
    setCapturedPhoto(null);
    setIsCapturing(false);
  };

  const locationStatus = !location
    ? { icon: AlertTriangle, color: "text-yellow-500", text: "Getting location..." }
    : !campusLocation
    ? { icon: XCircle, color: "text-red-500", text: "No active session found" }
    : locationValid
    ? { icon: CheckCircle, color: "text-green-500", text: `Inside campus (${campusLocation.radius}m range)` }
    : { icon: XCircle, color: "text-red-500", text: "Outside campus range" };

  const wifiStatusInfo =
    wifiStatus === null
      ? { icon: AlertTriangle, color: "text-yellow-500", text: "Checking WiFi..." }
      : wifiStatus
      ? { icon: Wifi, color: "text-green-500", text: "Campus WiFi OK" }
      : { icon: XCircle, color: "text-red-500", text: "Not on campus WiFi" };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Location-Based Attendance</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl glass flex items-center space-x-3">
          <locationStatus.icon className={`h-5 w-5 ${locationStatus.color}`} />
          <span>{locationStatus.text}</span>
        </div>
        <div className="p-4 rounded-xl glass flex items-center space-x-3">
          <wifiStatusInfo.icon className={`h-5 w-5 ${wifiStatusInfo.color}`} />
          <span>{wifiStatusInfo.text}</span>
        </div>
      </div>

      {campusLocation && location && (
        <div className="glass p-4 rounded-xl">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
            <MapPin className="h-4 w-4" />
            <span>Your Location: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Session Location: {campusLocation.latitude.toFixed(6)}, {campusLocation.longitude.toFixed(6)}</span>
          </div>
        </div>
      )}

      <div className="glass p-6 rounded-xl text-center">
        <Radio className={`h-14 w-14 mx-auto ${isTracking ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
        
        {loadingStudent ? (
          <div className="text-yellow-500 mt-4">Student data loading, please wait...</div>
        ) : !currentStudent ? (
          <div className="text-red-500 mt-4">Student data not available</div>
        ) : !campusLocation ? (
          <div className="text-red-500 mt-4">No active attendance session found. Please ask admin to start a session.</div>
        ) : !isTracking ? (
          <>
            <p className="text-muted-foreground mt-4 mb-4">
              Enable location tracking to automatically mark attendance when you're in range
            </p>
            <button
              onClick={startLocationTracking}
              className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
            >
              Start Location Tracking
            </button>
          </>
        ) : (
          <>
            {!showCamera ? (
              <>
                <p className="text-green-500 font-semibold mt-4 mb-2">📍 Tracking your location...</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {locationValid
                    ? "✅ You're in range! Camera verification will be required to mark attendance."
                    : "⏳ Waiting for you to enter the range..."}
                </p>
                <button
                  onClick={stopLocationTracking}
                  className="px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
                >
                  Stop Tracking
                </button>
              </>
            ) : (
              <>
                {/* Camera Verification */}
                <div className="mt-4 space-y-4">
                  <h3 className="text-lg font-semibold">Camera Verification Required</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Please take a selfie to verify your presence and mark attendance
                  </p>

                  {!capturedPhoto ? (
                    <>
                      <div className="relative bg-black rounded-lg overflow-hidden mx-auto max-w-md">
                        <video
                          ref={videoRef}
                          className="w-full h-auto"
                          playsInline
                          muted
                          autoPlay
                        />
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={capturePhoto}
                          className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2"
                        >
                          <Camera className="h-5 w-5" />
                          Capture Photo
                        </button>
                        <button
                          onClick={stopCamera}
                          className="px-6 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative bg-black rounded-lg overflow-hidden mx-auto max-w-md">
                        <img src={capturedPhoto} alt="Captured" className="w-full h-auto" />
                      </div>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={confirmAndMark}
                          disabled={isCapturing}
                          className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          {isCapturing ? (
                            <>
                              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                              Marking Attendance...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-5 w-5" />
                              Confirm & Mark Attendance
                            </>
                          )}
                        </button>
                        <button
                          onClick={retakePhoto}
                          disabled={isCapturing}
                          className="px-6 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600 transition-colors disabled:opacity-50"
                        >
                          Retake
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {result && (
          <div className={`p-4 mt-4 rounded-xl glass ${result.success ? "bg-green-500/10" : "bg-red-500/10"}`}>
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
    </div>
  );
};

export default QRScanner;
