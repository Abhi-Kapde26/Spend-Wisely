import fs from 'node:fs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { listTransactions } from '../repositories/transactions.js';
import { listBorrowLend } from '../repositories/borrowLend.js';
import { statement } from './historyService.js';
import { findUserById } from '../repositories/users.js';
import { pad2, daysInMonth, round2 } from '../utils/shape.js';

/* ------------------------------------------------------------------ */
/* Shared row builder                                                  */
/* ------------------------------------------------------------------ */

function buildRows(userId, { from, to, type = null }) {
  const { items } = listTransactions(userId, { from, to, type, limit: 5000, sort: 'desc' });
  const bl = listBorrowLend(userId).items.filter((r) => r.date >= from && r.date <= to);

  const rows = items.map((t) => ({
    date: t.date,
    type: t.type === 'income' ? 'Income' : 'Expense',
    category: t.category?.name || '',
    amount: Math.abs(t.amount),
    direction: t.type === 'income' ? 'IN' : 'OUT',
    comment: t.comment || '',
  }));

  for (const b of bl) {
    rows.push({
      date: b.date,
      type: b.type === 'borrow' ? 'Borrowed' : 'Lent',
      category: b.person,
      amount: b.amount,
      direction: b.type === 'borrow' ? 'IN' : 'OUT',
      comment: b.comment || '',
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows;
}

const HEADERS = ['Date', 'Type', 'Category/Person', 'Amount', 'Direction', 'Comment'];

/* ------------------------------------------------------------------ */
/* CSV (UTF-8 BOM + CRLF so Excel opens ₹ correctly)                  */
/* ------------------------------------------------------------------ */

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rows) {
  const lines = [HEADERS.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push([r.date, r.type, r.category, r.amount, r.direction, r.comment].map(csvEscape).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ */
/* Excel (styled header, frozen row, auto width + Summary sheet)       */
/* ------------------------------------------------------------------ */

export async function buildExcel(userId, rows, { from, to }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Spend Wisely';
  wb.created = new Date();

  const ws = wb.addWorksheet('Transactions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Category/Person', key: 'category', width: 22 },
    { header: 'Amount', key: 'amount', width: 16, style: { numFmt: '₹#,##0.00' } },
    { header: 'Direction', key: 'direction', width: 11 },
    { header: 'Comment', key: 'comment', width: 34 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
  headerRow.alignment = { vertical: 'middle' };

  for (const r of rows) {
    ws.addRow({ ...r, amount: Number(r.amount) });
  }
  ws.eachRow((row, n) => {
    if (n > 1) row.getCell(4).alignment = { horizontal: 'right' };
  });

  // Summary sheet
  const income = round2(rows.filter((r) => r.direction === 'IN').reduce((s, r) => s + r.amount, 0));
  const expenses = round2(rows.filter((r) => r.type === 'Expense').reduce((s, r) => s + r.amount, 0));
  const lent = round2(rows.filter((r) => r.type === 'Lent').reduce((s, r) => s + r.amount, 0));
  const borrowed = round2(rows.filter((r) => r.type === 'Borrowed').reduce((s, r) => s + r.amount, 0));

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'metric', width: 26 }, { header: 'Amount', key: 'amount', width: 16 }];
  const sh = sum.getRow(1);
  sh.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
  sum.addRow({ metric: 'Period', amount: `${from} to ${to}` });
  sum.addRow({ metric: 'Money In', amount: income });
  sum.addRow({ metric: 'Expenses', amount: expenses });
  sum.addRow({ metric: 'Money Lent', amount: lent });
  sum.addRow({ metric: 'Money Borrowed', amount: borrowed });
  sum.addRow({ metric: 'Net (In - Out - Lent + Borrowed)', amount: round2(income - expenses - lent + borrowed) });
  sum.getColumn(2).numFmt = '₹#,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* ------------------------------------------------------------------ */
/* PDF — bank-style monthly statement                                  */
/* ------------------------------------------------------------------ */

/** Windows Unicode fonts that carry ₹ (U+20B9); Helvetica cannot render it. */
const FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\arial.ttf',
  'C:\\Windows\\Fonts\\segoeui.ttf',
  'C:\\Windows\\Fonts\\calibri.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];

function pickFont() {
  for (const p of FONT_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

const GREEN = '#10b981';
const DARK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

/**
 * Streams a full PDF statement. Kept in one function so the doc lifecycle
 * stays simple (register font → write pages → end).
 */
export function streamPdf(userId, { year, month }, res) {
  const st = statement(userId, year, month);
  const user = findUserById(userId);
  const rows = buildRows(userId, { from: st.from, to: st.to });

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const fontPath = pickFont();
  if (fontPath) doc.registerFont('body', fontPath);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="spend-wisely-statement-${year}-${pad2(month)}.pdf"`);
  doc.on('error', (err) => {
    console.error('[API] PDF generation error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    else res.destroy();
  });
  doc.pipe(res);

  const font = fontPath ? 'body' : 'Helvetica';
  const money = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pageWidth = doc.page.width - 100;
  let y = 50;

  const ensureSpace = (needed) => {
    if (y + needed > doc.page.height - 70) {
      doc.addPage();
      y = 50;
    }
  };

  // Header
  doc.font(font).fontSize(20).fillColor(DARK).text('SPEND WISELY', 50, y, { lineBreak: false });
  doc.font(font).fontSize(9).fillColor(MUTED).text('Personal Financial Statement', 50, y + 26, { lineBreak: false });
  doc.font(font).fontSize(11).fillColor(DARK).text(st.label, 50, y, { width: pageWidth, align: 'right' });
  doc.font(font).fontSize(8).fillColor(MUTED)
    .text(`Generated ${new Date().toLocaleString('en-IN')}`, 50, y + 16, { width: pageWidth, align: 'right' });
  doc.moveTo(50, y + 40).lineTo(50 + pageWidth, y + 40).strokeColor(GREEN).lineWidth(2).stroke();
  y += 58;

  doc.font(font).fontSize(10).fillColor(DARK).text(`Account holder: ${user?.name || '—'}    •    ${user?.email || ''}`, 50, y);
  y += 30;

  // Summary boxes
  const boxW = (pageWidth - 30) / 4;
  [
    { label: 'Opening Balance', value: st.openingBalance, color: DARK },
    { label: 'Money In', value: st.moneyIn, color: '#16a34a' },
    { label: 'Money Out', value: st.moneyOut, color: '#dc2626' },
    { label: 'Closing Balance', value: st.closingBalance, color: GREEN },
  ].forEach((b, i) => {
    const x = 50 + i * (boxW + 10);
    doc.roundedRect(x, y, boxW, 54, 6).fillAndStroke('#f8fafc', LINE);
    doc.font(font).fontSize(7.5).fillColor(MUTED).text(b.label, x + 8, y + 9, { width: boxW - 16 });
    doc.font(font).fontSize(11).fillColor(b.color).text(money(b.value), x + 8, y + 26, { width: boxW - 16 });
  });
  y += 72;

  // Breakdown
  doc.font(font).fontSize(11).fillColor(DARK).text('Monthly Breakdown', 50, y);
  y += 20;
  [
    ['Income', st.income],
    ['Expenses', st.expenses],
    ['Money Lent', st.moneyLent],
    ['Money Borrowed', st.moneyBorrowed],
    ['Repayments Received', st.repaymentsReceived],
    ['Repayments Given', st.repaymentsGiven],
  ].forEach(([label, value], i) => {
    if (i % 2 === 0) doc.rect(50, y - 2, pageWidth, 17).fill('#f8fafc');
    doc.font(font).fontSize(9).fillColor(DARK).text(label, 58, y + 1, { lineBreak: false });
    doc.font(font).fontSize(9).fillColor(DARK).text(money(value), 50, y + 1, { width: pageWidth - 8, align: 'right' });
    y += 17;
  });
  y += 24;

  // Transactions
  doc.font(font).fontSize(11).fillColor(DARK).text(`Transactions (${rows.length})`, 50, y);
  y += 22;

  const cols = { date: 62, type: 74, cat: 150, amount: 92, dir: 44, comment: 0 };
  const drawHead = () => {
    doc.rect(50, y - 3, pageWidth, 17).fill(GREEN);
    doc.font(font).fontSize(8).fillColor('#ffffff');
    doc.text('Date', 56, y, { width: cols.date, lineBreak: false });
    doc.text('Type', 56 + cols.date, y, { width: cols.type, lineBreak: false });
    doc.text('Category / Person', 56 + cols.date + cols.type, y, { width: cols.cat, lineBreak: false });
    doc.text('Amount', 56 + cols.date + cols.type + cols.cat, y, { width: cols.amount, align: 'right', lineBreak: false });
    doc.text('In/Out', 64 + cols.date + cols.type + cols.cat + cols.amount, y, { width: cols.dir, lineBreak: false });
    doc.text('Comment', 74 + cols.date + cols.type + cols.cat + cols.amount + cols.dir, y, { lineBreak: false });
    y += 18;
  };
  ensureSpace(40);
  drawHead();

  rows.forEach((r, i) => {
    ensureSpace(20);
    if (i % 2 === 1) doc.rect(50, y - 2, pageWidth, 15).fill('#f8fafc');
    doc.font(font).fontSize(8).fillColor(DARK);
    const x0 = 56;
    doc.text(r.date, x0, y, { width: cols.date, lineBreak: false });
    doc.text(r.type, x0 + cols.date, y, { width: cols.type, lineBreak: false });
    doc.text(String(r.category || ''), x0 + cols.date + cols.type, y, { width: cols.cat, ellipsis: true, lineBreak: false });
    doc.fillColor(r.direction === 'IN' ? '#16a34a' : '#dc2626')
      .text(money(r.amount), x0 + cols.date + cols.type + cols.cat, y, { width: cols.amount - 6, align: 'right', lineBreak: false });
    doc.fillColor(DARK).text(r.direction, 64 + cols.date + cols.type + cols.cat + cols.amount, y, { width: cols.dir, lineBreak: false });
    doc.fillColor(MUTED).text(String(r.comment || ''), 74 + cols.date + cols.type + cols.cat + cols.amount + cols.dir, y, { lineBreak: false, ellipsis: true });
    y += 15;
  });

  // Footer page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font(font).fontSize(8).fillColor(MUTED)
      .text(`Page ${i + 1} of ${range.count}`, 50, doc.page.height - 55, { width: pageWidth, align: 'center' });
  }

  doc.end();
}

/** Convenience: export bundle for a date range. */
export function exportContext(userId, { from, to, type }) {
  return { rows: buildRows(userId, { from, to, type }), from, to };
}
