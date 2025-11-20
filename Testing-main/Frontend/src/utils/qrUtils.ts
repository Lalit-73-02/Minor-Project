import QRCode from "qrcode";
import { QRCode as QRCodeType } from "@/types";
import { apiFetch } from "@/lib/api";

export const generateQRCode = async (
  sessionType: "check-in" | "check-out",
  location?: { latitude: number; longitude: number; radius: number },
  colors: { dark: string; light: string } = { dark: "#000000", light: "#ffffff" }
): Promise<QRCodeType> => {
  const data = await apiFetch<{ active: boolean; qr: any } | any>(
    "/api/qrcode/generate",
    {
      method: "POST",
      body: JSON.stringify({ sessionType, location }),
    }
  );

  const qrRecord = (data as any).qr ?? data;
  const payload = qrRecord.payload || qrRecord.code;
  const generatedAt = new Date(qrRecord.generatedAt || qrRecord.generated_at);
  const expiresAt = new Date(qrRecord.expiresAt || qrRecord.expires_at);

  const qrCodeDataURL = await QRCode.toDataURL(payload, {
    width: 320,
    margin: 1,
    color: colors,
  });

  return {
    id: String(qrRecord.id),
    code: qrCodeDataURL,
    generatedAt,
    expiresAt,
    isActive: true,
    sessionType: qrRecord.sessionType || qrRecord.session_type || sessionType,
    location: qrRecord.location || location,
  };
};

export const validateQRCode = (qrCode: QRCodeType): boolean => {
  const now = new Date();
  return qrCode.isActive && now < qrCode.expiresAt;
};

