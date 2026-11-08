const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const STYLES = `
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #115e54; }
  p.meta { font-size: 11px; color: #64748b; margin: 0 0 20px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; min-width: 130px; }
  .kpi span { display: block; font-size: 10px; color: #94a3b8; font-weight: bold; }
  .kpi strong { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; background: #f8fafc; color: #64748b; padding: 8px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
  th:last-child, td:last-child { text-align: right; }
`;

// Frontend-only export: renders the report into a hidden frame and opens the browser print
// dialog, where the user can choose "Save as PDF".
export const printReport = ({ title, meta = [], kpis = [], columns = [], rows = [] }) => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLES}</style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${meta.map(escapeHtml).join(' &nbsp;|&nbsp; ')}</p>
    <div class="kpis">${kpis.map((kpi) => `<div class="kpi"><span>${escapeHtml(kpi.title)}</span><strong>${escapeHtml(kpi.value)}</strong></div>`).join('')}</div>
    <table>
      <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length}">No records.</td></tr>`}</tbody>
    </table>
  </body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.srcdoc = html;
  frame.onload = () => {
    const printWindow = frame.contentWindow;
    printWindow.onafterprint = () => frame.remove();
    printWindow.focus();
    printWindow.print();
  };
  document.body.appendChild(frame);
};
