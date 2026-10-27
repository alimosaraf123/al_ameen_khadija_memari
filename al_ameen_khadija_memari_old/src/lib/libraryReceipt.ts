import { Platform } from 'react-native';

export interface IssueReceiptData {
  studentName: string;
  regNo: string | number;
  className: string;
  transactionId: string | number;
  photoUrl?: string | null;
  bookBarcode: string;
  bookName: string;
  issueDate?: string | Date | null;
  rackNo?: string | number | null;
  issuedByName?: string | null;
}

export function formatReceiptDate(v?: any): string {
  const d = v ? new Date(v) : new Date();
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day}-${month}-${year} ${pad(hours)}:${minutes}:${seconds} ${ampm}`;
}

export function buildReceiptHtml(data: IssueReceiptData, apiBase: string = ''): string {
  const studentName = String(data.studentName || '').trim() || '-';
  const regNo = String(data.regNo || '').trim() || '-';
  const className = String(data.className || '').trim() || '-';
  const transactionId = String(data.transactionId || '').trim() || '-';
  const bookBarcode = String(data.bookBarcode || '').trim() || '-';
  const bookName = String(data.bookName || '').trim() || '-';
  const rackNo = data.rackNo != null && String(data.rackNo).trim() !== '' ? String(data.rackNo) : '-';
  const issueDateFormatted = formatReceiptDate(data.issueDate);
  const issuedByName = String(data.issuedByName || 'Issued By').trim() || 'Issued By';

  let resolvedPhoto = '';
  if (data.photoUrl) {
    const raw = String(data.photoUrl).trim();
    if (/^https?:\/\//i.test(raw)) {
      resolvedPhoto = raw;
    } else {
      const base = apiBase.replace(/\/+$/, '');
      const path = raw.startsWith('/') ? raw : '/' + raw;
      resolvedPhoto = `${base}${path}`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Library Receipt - ${regNo}</title>
  <style>
    @page {
      size: 150mm 105mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #f1f5f9;
      font-family: Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #000000;
    }
    .wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 15px;
    }
    /* 14cm width x 9.5cm height card (fits on 15cm x 10.5cm page with 5mm margin all around) */
    .receipt-card {
      width: 140mm;
      height: 95mm;
      max-width: 140mm;
      max-height: 95mm;
      background: #ffffff;
      border: 1.5px solid #000000;
      padding: 7mm 8mm 6mm 8mm;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      box-sizing: border-box;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
    }
    .print-btn-bar {
      position: absolute;
      top: 7mm;
      right: 8mm;
      z-index: 20;
    }
    .print-btn {
      background: #198754;
      color: #ffffff;
      border: none;
      padding: 4px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .print-btn:hover {
      background: #157347;
    }
    .header-area {
      text-align: center;
      margin-bottom: 2px;
    }
    .school-title {
      font-size: 15px;
      font-weight: 900;
      color: #000000;
      letter-spacing: 0.1px;
      line-height: 1.2;
    }
    .school-subtitle {
      font-size: 10.5px;
      color: #444444;
      margin-top: 1px;
    }
    .receipt-heading {
      font-size: 12px;
      font-weight: 800;
      color: #000000;
      margin-top: 2px;
    }
    .info-photo-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 2px;
      margin-bottom: 4px;
    }
    .student-details {
      font-size: 11px;
      line-height: 1.35;
      color: #000000;
    }
    .detail-line {
      margin-bottom: 1.5px;
    }
    .detail-label {
      font-weight: 900;
      color: #000000;
    }
    .detail-val {
      color: #111111;
    }
    .photo-container {
      width: 58px;
      height: 68px;
      border: 1px solid #999999;
      background: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .student-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .photo-fallback {
      font-size: 9.5px;
      color: #888888;
      text-align: center;
    }
    .books-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 2px;
      margin-bottom: 4px;
    }
    .books-table th {
      background: #e9ecef;
      border: 1px solid #000000;
      padding: 4px 5px;
      font-size: 10.5px;
      font-weight: 800;
      text-align: center;
      color: #000000;
    }
    .books-table td {
      border: 1px solid #000000;
      padding: 4px 5px;
      font-size: 10.5px;
      text-align: center;
      color: #000000;
    }
    .signature-area {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 8px;
      padding-bottom: 1px;
    }
    .sig-col {
      text-align: center;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .dotted-line {
      border-top: 1px dashed #555555;
      width: 105px;
      margin-bottom: 2px;
    }
    .sig-name {
      font-size: 10px;
      color: #000000;
      font-weight: 600;
      min-height: 13px;
    }
    .sig-label {
      font-size: 10px;
      color: #222222;
    }

    @media print {
      @page {
        size: 150mm 105mm;
        margin: 0;
      }
      body, html {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 150mm !important;
        height: 105mm !important;
        overflow: hidden !important;
      }
      .wrapper {
        padding: 5mm !important;
        margin: 0 !important;
        width: 150mm !important;
        height: 105mm !important;
        min-height: 0 !important;
        box-sizing: border-box !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .receipt-card {
        width: 140mm !important;
        height: 95mm !important;
        max-width: 140mm !important;
        max-height: 95mm !important;
        border: 1.5px solid #000000 !important;
        margin: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="receipt-card">
      <div class="print-btn-bar no-print">
        <button class="print-btn" onclick="window.print()">Print</button>
      </div>

      <div>
        <div class="header-area">
          <div class="school-title">Al-Ameen Mission Academy, Memari</div>
          <div class="school-subtitle">Memari, Purba Bardhaman</div>
          <div class="receipt-heading">Library Book Issue Receipt</div>
        </div>

        <div class="info-photo-row">
          <div class="student-details">
            <div class="detail-line"><span class="detail-label">Name:</span> <span class="detail-val">${studentName}</span></div>
            <div class="detail-line"><span class="detail-label">Reg No:</span> <span class="detail-val">${regNo}</span></div>
            <div class="detail-line"><span class="detail-label">Class:</span> <span class="detail-val">${className}</span></div>
            <div class="detail-line"><span class="detail-label">Transaction ID:</span> <span class="detail-val">${transactionId}</span></div>
          </div>
          <div class="photo-container">
            ${
              resolvedPhoto
                ? `<img src="${resolvedPhoto}" class="student-photo" alt="Student" onerror="this.parentElement.innerHTML='<div class=\\'photo-fallback\\'>No Photo</div>'" />`
                : `<div class="photo-fallback">No Photo</div>`
            }
          </div>
        </div>

        <table class="books-table">
          <thead>
            <tr>
              <th style="width: 25%;">Book Barcode</th>
              <th style="width: 33%;">Book Name</th>
              <th style="width: 28%;">Issue Date</th>
              <th style="width: 14%;">Rack No</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${bookBarcode}</td>
              <td>${bookName}</td>
              <td>${issueDateFormatted}</td>
              <td>${rackNo}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="signature-area">
        <div class="sig-col">
          <div class="dotted-line"></div>
          <div class="sig-name">${issuedByName}</div>
          <div class="sig-label">Issued By</div>
        </div>
        <div class="sig-col">
          <div class="dotted-line"></div>
          <div class="sig-name">( ${studentName} )</div>
          <div class="sig-label">Received By</div>
        </div>
        <div class="sig-col">
          <div class="dotted-line"></div>
          <div class="sig-label" style="margin-top: 1px;">Returned By</div>
          <div class="sig-label" style="margin-top: 2px;">on:__________________</div>
        </div>
      </div>
    </div>
  </div>
  <script>
    function notifyAndClose() {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'LIBRARY_RECEIPT_PRINTED' }, '*');
        }
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'LIBRARY_RECEIPT_PRINTED' }, '*');
        }
      } catch (e) {}
      setTimeout(function() {
        try {
          window.close();
        } catch (e) {}
      }, 300);
    }
    window.addEventListener('afterprint', notifyAndClose);
  </script>
</body>
</html>`;
}

export function openReceiptPrintWindow(
  data: IssueReceiptData,
  apiBase: string = '',
  onPrinted?: () => void
) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  const html = buildReceiptHtml(data, apiBase);
  const w = window.open('', '_blank', 'width=620,height=460,scrollbars=no');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();

    let handled = false;
    const handleClose = () => {
      if (handled) return;
      handled = true;
      try {
        onPrinted?.();
      } catch {}
      setTimeout(() => {
        try {
          if (!w.closed) w.close();
        } catch {}
      }, 300);
    };

    try {
      w.addEventListener('afterprint', handleClose);
      (w as any).onafterprint = handleClose;
    } catch {}

    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch (err) {
        console.warn('Receipt auto-print error:', err);
      }
    }, 450);
    return true;
  }
  return false;
}

