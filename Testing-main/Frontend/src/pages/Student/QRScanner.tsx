import React, { useEffect, useRef, useState } from "react";
import { MapPin, Wifi, CheckCircle, XCircle, AlertTriangle, Radio, Camera, User } from "lucide-react";
import { verifyLocation, verifyWiFi } from "../../utils/security";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
  const locationWatchId = useRef<number | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMarkedTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inRangeRef = useRef<boolean>(false);
  const watchAttemptsRef = useRef<number>(0);

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

      // Only log if there's an issue or first time
      if (!data.active || !data.qr) {
        console.log("Active QR API Response:", {
          status: res.status,
          ok: res.ok,
          active: data.active,
          hasQR: !!data.qr,
          message: data.message
        });
      }

      // Check if response indicates no active QR
      if (data.active === false || !data.qr) {
        console.log("No active QR session:", data.message || "No active session");
        setCampusLocation(null);
        setLoadingCampusLocation(false);
        return;
      }

      // If we have active QR, process it
      const record = data.qr;
      
      // Check if location values exist and are not null/undefined
      const lat = record.latitude != null ? parseFloat(record.latitude) : null;
      const lng = record.longitude != null ? parseFloat(record.longitude) : null;
      const radius = record.radius != null ? parseInt(record.radius, 10) : 2000;

      if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
        setCampusLocation({
          latitude: lat,
          longitude: lng,
          radius: radius || 2000,
        });
        console.log("✅ Campus location set:", { latitude: lat, longitude: lng, radius: radius || 2000 });
      } else {
        console.warn("⚠️ Invalid location data in QR:", {
          lat,
          lng,
          radius,
          rawRecord: record
        });
        setCampusLocation(null);
      }
    } catch (error) {
      console.error("❌ Error fetching active QR location:", error);
      setCampusLocation(null);
    } finally {
      setLoadingCampusLocation(false);
    }
  };

  // Initial load - run only once
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Separate polling effect - only poll if no campus location found
  // Use ref to avoid dependency issues
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Clear any existing poll interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Only poll if we don't have a campus location
    if (!campusLocation) {
      // Poll for active QR every 10 seconds to catch newly generated sessions
      pollIntervalRef.current = setInterval(() => {
        fetchActiveQRLocation();
      }, 10000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [campusLocation]);

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

  // Capture photo directly from camera (no video preview)
  const startCamera = async () => {
    try {
      setIsCapturing(true);
      setShowCamera(true);
      
      // Get camera stream
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
        const video = videoRef.current;
        video.srcObject = stream;
        
        // Wait for video to be ready and capture immediately
        await new Promise<void>((resolve, reject) => {
          const onLoadedMetadata = () => {
            video.play()
              .then(() => {
                // Wait a moment for camera to stabilize
                setTimeout(() => {
                  if (video.readyState >= 2 && video.videoWidth > 0) {
                    // Capture photo immediately
                    capturePhotoDirectly();
                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                    video.removeEventListener('error', onError);
                    resolve();
                  }
                }, 1000);
              })
              .catch(reject);
          };
          
          const onError = (err: Event) => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('error', onError);
            reject(new Error("Camera failed"));
          };
          
          video.addEventListener('loadedmetadata', onLoadedMetadata);
          video.addEventListener('error', onError);
          
          // Fallback timeout
          setTimeout(() => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              capturePhotoDirectly();
              video.removeEventListener('loadedmetadata', onLoadedMetadata);
              video.removeEventListener('error', onError);
              resolve();
            }
          }, 3000);
        });
      }
    } catch (error) {
      console.error("Camera error:", error);
      setIsCapturing(false);
      setShowCamera(false);
      setResult({ success: false, message: "Camera access denied. Please allow camera access to mark attendance." });
    }
  };

  // Capture photo directly without user interaction
  const capturePhotoDirectly = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      console.error("Video or canvas not available");
      setIsCapturing(false);
      return;
    }

    try {
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      
      if (width === 0 || height === 0) {
        console.error("Invalid video dimensions");
        setIsCapturing(false);
        return;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const photoData = canvas.toDataURL("image/jpeg", 0.8);
        setCapturedPhoto(photoData);
        setIsCapturing(false);
        
        // Stop camera stream immediately after capture
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      } else {
        console.error("Could not get canvas context");
        setIsCapturing(false);
      }
    } catch (error) {
      console.error("Error capturing photo:", error);
      setIsCapturing(false);
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

  // Retake photo - restart camera
  const retakePhoto = () => {
    setCapturedPhoto(null);
    setIsCapturing(false);
    startCamera();
  };

  // Helper function to get location with high accuracy and retry logic
  const getHighAccuracyLocation = (retries = 3, useHighAccuracy = true): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      
      const tryGetLocation = (highAccuracy: boolean) => {
        attempts++;
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            // Check if accuracy is acceptable (within 50 meters) or if we've tried enough
            if (position.coords.accuracy <= 50 || attempts >= retries || !highAccuracy) {
              resolve(position);
            } else if (attempts < retries) {
              // Retry for better accuracy
              setTimeout(() => tryGetLocation(highAccuracy), 2000);
            } else {
              // Accept current position even if accuracy is not ideal
              resolve(position);
            }
          },
          (error) => {
            // If timeout with high accuracy, try with lower accuracy
            if (error.code === 3 && highAccuracy && attempts < retries) {
              console.warn("High accuracy timeout, trying with standard accuracy...");
              setTimeout(() => tryGetLocation(false), 1000);
            } else if (attempts < retries) {
              // Retry on other errors
              setTimeout(() => tryGetLocation(highAccuracy), 2000);
            } else {
              reject(error);
            }
          },
          {
            enableHighAccuracy: highAccuracy,
            maximumAge: highAccuracy ? 0 : 30000, // Allow 30s cache if not high accuracy
            timeout: highAccuracy ? 15000 : 20000, // Longer timeout for high accuracy
          }
        );
      };
      
      tryGetLocation(useHighAccuracy);
    });
  };

  // Mark attendance by location with camera verification
  const markAttendanceByLocation = async (photoData?: string) => {
    if (!currentStudent) {
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
      setIsCapturing(true);
      
      // Get fresh location with timeout
      let currentLocation = location;
      const locationPromise = getHighAccuracyLocation(1, false).then(
        (freshPosition) => {
          return {
            latitude: freshPosition.coords.latitude,
            longitude: freshPosition.coords.longitude,
          };
        }
      ).catch((error) => {
        console.warn("Failed to get fresh location, using cached:", error);
        return null;
      });

      // Wait max 5 seconds for location
      const locationTimeout = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000);
      });

      const locationResult = await Promise.race([locationPromise, locationTimeout]);
      
      if (locationResult) {
        currentLocation = locationResult;
        setLocation(currentLocation);
      } else if (!currentLocation) {
        setResult({ success: false, message: "Unable to get your location. Please try again." });
        setIsCapturing(false);
        return;
      }

      // Send photo and location to backend with timeout
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const res = await fetch(`${BACKEND_URL}/api/qrcode/mark-by-location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: currentStudent.rollNo,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            photo: photoData, // Base64 encoded photo
          }),
          signal: controller.signal,
        });
        
        clearTimeout(fetchTimeout);
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
          
          // Invalidate attendance queries to refresh data everywhere
          queryClient.invalidateQueries({ queryKey: ['student-attendance'] });
          queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
          queryClient.invalidateQueries({ queryKey: ['student-analytics'] });
        } else {
          setResult({ success: false, message: data.message || "Failed to mark attendance" });
          setIsCapturing(false);
        }
      } catch (fetchError: any) {
        clearTimeout(fetchTimeout);
        if (fetchError.name === 'AbortError') {
          setResult({ success: false, message: "Request timed out. Please check your connection and try again." });
        } else {
          throw fetchError;
        }
        setIsCapturing(false);
      }
    } catch (err) {
      console.error("Error marking attendance:", err);
      setResult({ success: false, message: "Server error. Please try again." });
      setIsCapturing(false);
    }
  };

  // Start real-time location tracking
  const startLocationTracking = async () => {
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

    // First, get initial high-accuracy location with retries
    try {
      const initialPosition = await getHighAccuracyLocation(3);
      const initialLocation = {
        latitude: initialPosition.coords.latitude,
        longitude: initialPosition.coords.longitude,
      };
      setLocation(initialLocation);
    } catch (error) {
      console.error("Failed to get initial location:", error);
      setResult({ 
        success: false, 
        message: "Unable to get your location. Please enable location services and try again." 
      });
      setIsTracking(false);
      return;
    }

    // Then watch position for real-time updates
    // Start with high accuracy, fallback to standard if timeout
    watchAttemptsRef.current = 0;
    const startWatch = (highAccuracy: boolean) => {
      if (locationWatchId.current !== null) {
        navigator.geolocation.clearWatch(locationWatchId.current);
      }
      
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
          
          // Handle timeout specifically
          if (error.code === 3 && highAccuracy && watchAttemptsRef.current === 0) {
            // Timeout with high accuracy, try with standard accuracy
            watchAttemptsRef.current++;
            console.warn("High accuracy timeout, switching to standard accuracy...");
            startWatch(false);
          } else {
            // Other errors or already tried standard accuracy
            let errorMessage = "Location access error. ";
            if (error.code === 1) {
              errorMessage += "Please enable location permissions.";
            } else if (error.code === 2) {
              errorMessage += "Location unavailable.";
            } else if (error.code === 3) {
              errorMessage += "Location request timed out. Please try again.";
            }
            setResult({ success: false, message: errorMessage });
            setIsTracking(false);
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          maximumAge: highAccuracy ? 5000 : 30000, // Allow some cache to avoid timeout
          timeout: highAccuracy ? 20000 : 30000, // Longer timeout
        }
      );
    };

    startWatch(true); // Start with high accuracy

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
          <div className="space-y-4">
            <div className="text-red-500 mt-4">No active attendance session found. Please ask admin to start a session.</div>
            <button
              onClick={() => {
                setLoadingCampusLocation(true);
                fetchActiveQRLocation();
              }}
              className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
              disabled={loadingCampusLocation}
            >
              {loadingCampusLocation ? "Refreshing..." : "Refresh Session"}
            </button>
          </div>
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
                      <div className="relative bg-black rounded-lg overflow-hidden mx-auto max-w-md aspect-video flex items-center justify-center">
                        {isCapturing ? (
                          <div className="text-white text-center">
                            <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                            <p>Capturing photo...</p>
                          </div>
                        ) : (
                          <div className="text-white text-center">
                            <Camera className="h-12 w-12 mx-auto mb-2" />
                            <p>Photo will be captured automatically</p>
                          </div>
                        )}
                        <video
                          ref={videoRef}
                          className="hidden"
                          playsInline
                          muted
                          autoPlay
                        />
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                      <div className="flex gap-3 justify-center">
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
