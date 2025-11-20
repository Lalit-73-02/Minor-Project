import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

type ExportRecord = {
  rollNo: string;
  studentName: string;
  markedAt: string;
  department?: string;
  sessionType: string;
};

export const exportToPDF = (records: ExportRecord[]) => {
  const pdf = new jsPDF();
  pdf.setFontSize(18);
  pdf.text('Attendance Report', 20, 20);

  pdf.setFontSize(12);
  let yPosition = 40;

  records.forEach((record, index) => {
    if (yPosition > 280) {
      pdf.addPage();
      yPosition = 20;
    }

    const date = format(new Date(record.markedAt), 'PPP p');
    pdf.text(
      `${index + 1}. ${record.studentName} (${record.rollNo}) - ${date} - ${record.sessionType}`,
      20,
      yPosition
    );
    yPosition += 10;
  });

  pdf.save('attendance-report.pdf');
};

export const exportToExcel = (records: ExportRecord[]) => {
  const exportData = records.map((record) => ({
    'Student ID': record.rollNo,
    'Student Name': record.studentName,
    Department: record.department ?? 'N/A',
    Date: format(new Date(record.markedAt), 'PP'),
    Time: format(new Date(record.markedAt), 'pp'),
    Session: record.sessionType,
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  XLSX.writeFile(wb, 'attendance-report.xlsx');
};
