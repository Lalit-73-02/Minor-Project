import { Session } from '../types';

// Device fingerprinting
export const generateDeviceId = (): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx!.textBaseline = 'top';
  ctx!.font = '14px Arial';
  ctx!.fillText('Device fingerprint', 2, 2);
  
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL()
  ].join('|');
  
  return btoa(fingerprint).slice(0, 32);
};

// Location verification
export const verifyLocation = (
  currentLat: number,
  currentLng: number,
  allowedLat: number,
  allowedLng: number,
  radiusMeters: number = 2000

): boolean => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = currentLat * Math.PI / 180;
  const φ2 = allowedLat * Math.PI / 180;
  const Δφ = (allowedLat - currentLat) * Math.PI / 180;
  const Δλ = (allowedLng - currentLng) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const distance = R * c;
  return distance <= radiusMeters;
};

// WiFi verification - checks for campus WiFi networks
export const verifyWiFi = (): Promise<boolean> => {
  return new Promise((resolve) => {
    // List of campus WiFi network names (add your actual campus WiFi names)
    const campusWiFiNetworks = [
      'CAMPUS_WIFI',
      'UNIVERSITY_WIFI', 
      'STUDENT_WIFI',
      'EDUROAM',
      'CAMPUS_GUEST',
      'UNIVERSITY_GUEST',
      'STUDENT_NETWORK',
      'CAMPUS_NETWORK'
    ];

    // Check if we can access network information
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection && connection.effectiveType) {
        // If connected via WiFi (not cellular), assume campus WiFi for demo
        // In production, you'd need to use additional APIs or server-side verification
        resolve(true);
        return;
      }
    }

    // Fallback: Check if we're on localhost (development) or assume campus WiFi
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      resolve(true); // Allow for development
      return;
    }

    // For production, you might want to:
    // 1. Use a server-side API to verify WiFi network
    // 2. Use additional browser APIs if available
    // 3. Implement a more sophisticated network detection
    
    // For now, assume campus WiFi (you can change this to false for stricter checking)
    resolve(true);
  });
};

// Session management
export const validateSession = (session: Session): boolean => {
  const now = new Date();
  const lastActivity = new Date(session.lastActivity);
  const inactiveTime = now.getTime() - lastActivity.getTime();
  const maxInactiveTime = 30 * 60 * 1000; // 30 minutes

  return session.isActive && inactiveTime < maxInactiveTime;
};

// QR Code security
export const encryptQRData = (data: string): string => {
  // Simple encryption for demo - in production use proper encryption
  return btoa(data + '|' + Date.now());
};

export const decryptQRData = (encryptedData: string): { data: string; timestamp: number } | null => {
  try {
    const decoded = atob(encryptedData);
    const [data, timestamp] = decoded.split('|');
    return { data, timestamp: parseInt(timestamp) };
  } catch {
    return null;
  }
};