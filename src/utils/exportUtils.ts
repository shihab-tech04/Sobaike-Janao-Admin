/**
 * Sobaike Admin Export Utilities
 * Provides CSV formatting (with UTF-8 BOM encoding for Bengali Unicode support)
 * and formatted PDF document generation using jsPDF & jspdf-autotable.
 */

import { jsPDF } from 'jspdf';
import autoTable, { UserOptions } from 'jspdf-autotable';
import { Complaint } from '@/types/Complaint';
import {
  getHarassmentAgeGroupLabel,
  getHarassmentRelationshipLabel,
  getHarassmentReportingForLabel,
} from '@/utils/harassmentClassification';


// Helper to sanitize text for standard PDF rendering
function sanitizeText(val: unknown, fallback: string = '-'): string {
  if (val === null || val === undefined || val === '') return fallback;
  const str = String(val).trim();
  // Strip non-printable control characters
  return str.replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Escapes CSV field value and wraps in quotes if necessary
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Generates and triggers browser download of a CSV file with UTF-8 BOM
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]): boolean {
  try {
    const headerLine = headers.map(escapeCsvField).join(',');
    const rowLines = rows.map((row) => row.map(escapeCsvField).join(','));
    const csvContent = [headerLine, ...rowLines].join('\r\n');

    // \uFEFF is UTF-8 Byte Order Mark (BOM) ensuring Excel and text viewers parse Bangla script cleanly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Failed to trigger CSV download:', error);
    return false;
  }
}

/**
 * Common PDF styling setup with header banner, metadata card, and page footer
 */
function setupPdfHeaderAndFooter(
  doc: jsPDF,
  title: string,
  subtitle: string,
  filterItems: { label: string; value: string }[],
  totalCount: number,
  isLandscape: boolean
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Top Decorative Brand Bar
  doc.setFillColor(14, 116, 144); // Sky/Cyan 700
  doc.rect(0, 0, pageWidth, 4, 'F');

  // 2. Organization & Report Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text('SOBAI KE JANAO - CIVIC ADMIN', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text(title, 14, 21);

  // Timestamp & Export Notice on Right
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate 500
  const dateStr = `Export Date: ${new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  doc.text(dateStr, pageWidth - 14, 15, { align: 'right' });
  doc.text(`Total Records: ${totalCount}`, pageWidth - 14, 21, { align: 'right' });

  // 3. Filter Summary Box
  let currentY = 27;
  if (filterItems.length > 0 || subtitle) {
    doc.setFillColor(248, 250, 252); // Slate 50
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85); // Slate 700
    doc.text('FILTER CRITERIA:', 18, currentY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const filterText =
      filterItems.map((f) => `${f.label}: ${f.value}`).join('  |  ') || subtitle;
    
    // Truncate if too long
    const maxTextWidth = pageWidth - 65;
    const splitFilter = doc.splitTextToSize(filterText, maxTextWidth);
    doc.text(splitFilter[0] || 'All Records Included', 52, currentY + 5.5);
    
    if (subtitle && filterItems.length > 0) {
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(subtitle, 18, currentY + 10.5);
    }

    currentY += 19;
  } else {
    currentY += 6;
  }

  return currentY;
}

/**
 * Attaches page numbering and official footer disclaimer
 */
function attachPdfPageNumbers(doc: jsPDF) {
  const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : ((doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : 1);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // Slate 400

    // Footer divider line
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 11, pageWidth - 14, pageHeight - 11);

    // Left disclaimer
    doc.text(
      'Official & Confidential Civic Governance Record • Sobaike Platform Operations',
      14,
      pageHeight - 6
    );

    // Right Page Number
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 6, {
      align: 'right',
    });
  }
}

/* ==========================================================================
   1. COMPLAINTS EXPORT (CSV & PDF)
   ========================================================================== */

export function exportComplaintsToCsv(complaints: Complaint[], customFilename?: string): boolean {
  const filename = customFilename || `sobaike_complaints_${new Date().toISOString().slice(0, 10)}.csv`;
  const headers = [
    'Complaint ID',
    'Title (EN)',
    'Title (BN)',
    'Category (EN)',
    'Category (BN)',
    'Subcategory (EN)',
    'Subcategory (BN)',
    'Affected Person Age Group',
    'Relationship with Alleged Abuser',
    'Reporting For',
    'Status',
    'Urgency',
    'Ward',
    'Zone',
    'Address (EN)',
    'Address (BN)',
    'Citizen Name',
    'Citizen Phone',
    'Is Anonymous',
    'Assigned Department',
    'Upvotes',
    'Comments',
    'Created Date',
    'Updated Date',
  ];

  const rows = complaints.map((c) => [
    c.id,
    c.titleEn,
    c.titleBn,
    c.categoryEn,
    c.categoryBn,
    c.subcategoryEn,
    c.subcategoryBn,
    c.categoryId === 'harassment' ? getHarassmentAgeGroupLabel(c.affectedPersonAgeGroup, 'en') : '',
    c.categoryId === 'harassment' ? getHarassmentRelationshipLabel(c.allegedAbuserRelationship, 'en') : '',
    c.categoryId === 'harassment' ? getHarassmentReportingForLabel(c.reportingFor, 'en') : '',
    c.status,
    c.urgency,
    c.location?.ward || '',
    c.location?.zone || '',
    c.location?.addressEn || '',
    c.location?.addressBn || '',
    c.isAnonymous ? 'Anonymous' : c.citizenName || 'Citizen',
    c.isAnonymous ? 'Hidden' : c.citizenPhone || '',
    c.isAnonymous ? 'Yes' : 'No',
    c.assignedDepartment || '',
    c.upvotesCount,
    c.commentsCount,
    c.createdAt,
    c.updatedAt,
  ]);

  return downloadCsv(filename, headers, rows);
}

export interface ComplaintFilterSummary {
  status?: string;
  category?: string;
  ward?: string;
  urgency?: string;
  dateRange?: string;
  search?: string;
  affectedPersonAgeGroup?: string;
  allegedAbuserRelationship?: string;
  reportingFor?: string;
}

export function exportComplaintsToPdf(
  complaints: Complaint[],
  filterSummary?: ComplaintFilterSummary,
  customFilename?: string
): boolean {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const filename =
      customFilename ||
      `sobaike_complaints_${filterSummary?.status && filterSummary.status !== 'all' ? filterSummary.status + '_' : ''}${new Date().toISOString().slice(0, 10)}.pdf`;

    const filterItems: { label: string; value: string }[] = [];
    if (filterSummary?.status && filterSummary.status !== 'all') {
      filterItems.push({ label: 'Status', value: filterSummary.status.toUpperCase() });
    }
    if (filterSummary?.category && filterSummary.category !== 'all') {
      filterItems.push({ label: 'Category', value: filterSummary.category });
    }
    if (filterSummary?.ward && filterSummary.ward !== 'all') {
      filterItems.push({ label: 'Ward', value: filterSummary.ward });
    }
    if (filterSummary?.urgency && filterSummary.urgency !== 'all') {
      filterItems.push({ label: 'Urgency', value: filterSummary.urgency.toUpperCase() });
    }
    if (filterSummary?.search) {
      filterItems.push({ label: 'Search', value: `"${filterSummary.search}"` });
    }
    if (filterSummary?.affectedPersonAgeGroup && filterSummary.affectedPersonAgeGroup !== 'all') {
      filterItems.push({ label: 'Age Group', value: getHarassmentAgeGroupLabel(filterSummary.affectedPersonAgeGroup, 'en') });
    }
    if (filterSummary?.allegedAbuserRelationship && filterSummary.allegedAbuserRelationship !== 'all') {
      filterItems.push({ label: 'Relationship', value: getHarassmentRelationshipLabel(filterSummary.allegedAbuserRelationship, 'en') });
    }
    if (filterSummary?.reportingFor && filterSummary.reportingFor !== 'all') {
      filterItems.push({ label: 'Reporting For', value: getHarassmentReportingForLabel(filterSummary.reportingFor, 'en') });
    }

    const startY = setupPdfHeaderAndFooter(
      doc,
      'Operational Complaint Triage & Grievance Report',
      'Filtered citizen reports including classification, ward, status, and urgency metrics.',
      filterItems,
      complaints.length,
      true
    );

    const headers = [
      ['ID', 'Title / Issue', 'Category', 'Ward / Area', 'Urgency', 'Status', 'Citizen', 'Submitted Date']
    ];

    const body = complaints.map((c) => [
      c.id,
      sanitizeText(c.titleEn || c.titleBn),
      sanitizeText(c.categoryEn || c.categoryBn),
      sanitizeText(c.location?.ward || c.location?.zone || '-'),
      (c.urgency || 'medium').toUpperCase(),
      (c.status || 'submitted').replace(/_/g, ' ').toUpperCase(),
      c.isAnonymous ? 'Anonymous' : sanitizeText(c.citizenName, 'Citizen'),
      c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-',
    ]);

    const tableOptions: UserOptions = {
      startY,
      head: headers,
      body: body,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [15, 23, 42], // Dark Slate 900
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 20, fontStyle: 'bold' },
        1: { cellWidth: 70 },
        2: { cellWidth: 38 },
        3: { cellWidth: 32 },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 30, halign: 'center' },
        6: { cellWidth: 28 },
        7: { cellWidth: 26, halign: 'right' },
      },
      margin: { left: 14, right: 14, bottom: 16 },
    };

    autoTable(doc, tableOptions);
    attachPdfPageNumbers(doc);
    doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    return true;
  } catch (error) {
    console.error('Failed to generate Complaints PDF:', error);
    return false;
  }
}


