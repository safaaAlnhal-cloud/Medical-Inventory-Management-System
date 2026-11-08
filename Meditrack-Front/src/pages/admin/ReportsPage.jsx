import React, { useCallback, useState } from 'react';
import { FileText, Calendar, Tag, Package, X, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { ErrorState, TableState } from '../../components/common/DataState';
import PageHeader from '../../components/common/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useLookups } from '../../hooks/useLookups';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import { getErrorMessage } from '../../services/apiError';
import { getReportApi } from '../../services/reportsApi';
import { formatDate, getInitial } from '../../utils/formatters';
import { resolveId } from '../../utils/ids';
import { printReport } from '../../utils/printReport';
import { buildDonutGradient, DATE_RANGES, DEFAULT_DATE_RANGE, getPageWindow, resolveDateRange } from '../../utils/reports';
import { REPORT_TABS, REPORT_VIEWS } from './reportConfig';

const PAGE_SIZE = 5;
const EXPORT_PAGE_SIZE = 1000;
const DEFAULT_FILTERS = { dateRange: DEFAULT_DATE_RANGE, categoryId: 'all', itemId: 'all' };
const EMPTY_REPORT = { totals: {}, breakdown: [], rows: [], pagination: { page: 1, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 1 } };
// Same three colours, in the same order, as the donut segments (DONUT_COLORS in utils/reports.js).
const LEGEND_DOT_CLASSES = ['bg-[#16423c]', 'bg-[#409689]', 'bg-[#9bd4cd]'];

const sameFilters = (a, b) => a.dateRange === b.dateRange && a.categoryId === b.categoryId && a.itemId === b.itemId;

const ReportsPage = () => {
  const search = useSearchQuery();
  const lookups = useLookups();
  const { showError } = useToast();

  const [activeTab, setActiveTab] = useState(REPORT_TABS[0].id);
  // `draftFilters` is what the selects show; `filters` is what the report was generated with.
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);

  // The page number belongs to one tab + filters + search combination and resets when it changes.
  const scope = `${activeTab}|${search}|${filters.dateRange}|${filters.categoryId}|${filters.itemId}`;
  const [pageState, setPageState] = useState({ scope, page: 1 });
  const page = pageState.scope === scope ? pageState.page : 1;
  const setPage = (next) => setPageState({ scope, page: next });

  const categoryId = filters.categoryId === 'all' ? undefined : resolveId(lookups.categories, filters.categoryId);
  const itemId = filters.itemId === 'all' ? undefined : resolveId(lookups.items, filters.itemId);

  const buildQuery = useCallback((paging) => ({
    ...resolveDateRange(filters.dateRange),
    categoryId,
    itemId,
    search,
    ...paging,
  }), [filters.dateRange, categoryId, itemId, search]);

  const loadReport = useCallback(() => getReportApi(activeTab, buildQuery({ page, pageSize: PAGE_SIZE })), [activeTab, buildQuery, page]);
  const { data, loading, error, reload } = useAsyncData(loadReport, null);

  const tab = REPORT_TABS.find((candidate) => candidate.id === activeTab);
  const view = REPORT_VIEWS[activeTab];
  const report = data?.type === activeTab ? data : EMPTY_REPORT;
  const { pagination } = report;
  const chartSegments = view.chart(report, lookups);

  const handleGenerateReport = () => {
    if (sameFilters(filters, draftFilters)) reload();
    else setFilters(draftFilters);
  };

  const handleClearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  };

  const describeFilters = () => [
    `Generated: ${formatDate(new Date())}`,
    ...(view.usesDateRange ? [`Period: ${DATE_RANGES.find((range) => range.value === filters.dateRange)?.label}`] : ['As of today']),
    `Category: ${filters.categoryId === 'all' ? 'All Categories' : lookups.categoryName(categoryId)}`,
    `Item: ${filters.itemId === 'all' ? 'All Items' : lookups.itemName(itemId)}`,
    ...(search ? [`Search: ${search}`] : []),
  ];

  // Exports every row of the current report (not just the visible page) through the print dialog.
  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const fullReport = await getReportApi(activeTab, buildQuery({ page: 1, pageSize: EXPORT_PAGE_SIZE }));
      // One request holds at most EXPORT_PAGE_SIZE rows. If the report is longer, the export
      // says so in its header instead of passing a partial list off as the whole report.
      const { totalItems } = fullReport.pagination;
      const truncated = totalItems > fullReport.rows.length;
      if (truncated) showError(`This report has ${totalItems} records. Only the first ${fullReport.rows.length} are in the export.`);
      printReport({
        title: `MediTrack - ${tab.label}`,
        meta: [...describeFilters(), ...(truncated ? [`Showing the first ${fullReport.rows.length} of ${totalItems} records`] : [])],
        kpis: view.kpis.map((kpi) => ({ title: kpi.title, value: kpi.value(fullReport.totals) })),
        columns: view.columns,
        rows: fullReport.rows.map((row) => {
          const cells = view.row(row, lookups);
          return [lookups.itemName(row.itemId), cells.secondary, cells.note ? `${cells.quantity} (${cells.note})` : cells.quantity, cells.value];
        }),
      });
    } catch (err) {
      showError(getErrorMessage(err, 'Could not export the report. Please try again.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
      <PageHeader
        title="Reports"
        subtitle="Monitor medical inventory performance, movements, and stock valuations."
        actions={tab.allowPdf && (
          <button type="button" onClick={handleExportPDF} disabled={exporting} className="px-4 py-2.5 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50">
            <FileText className="w-4 h-4" /> {exporting ? 'Preparing...' : 'Export PDF Report'}
          </button>
        )}
      />

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {REPORT_TABS.map((reportTab) => {
          const TabIcon = reportTab.icon;
          const isActive = activeTab === reportTab.id;
          return (
            <button
              type="button"
              key={reportTab.id}
              onClick={() => setActiveTab(reportTab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                isActive ? 'bg-[#115e54] text-white shadow-sm' : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <TabIcon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {reportTab.label}
            </button>
          );
        })}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* The Period only applies to reports built from transactions. For the others it is
              disabled and says why, so it never looks applied when it is not. */}
          <div title={view.usesDateRange ? undefined : 'This report shows the inventory as it is today, so no period applies'} className={`flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 ${view.usesDateRange ? '' : 'opacity-60'}`}>
            <Calendar className="w-4 h-4 text-slate-400" />
            {view.usesDateRange ? (
              <select aria-label="Date range" value={draftFilters.dateRange} onChange={(e) => setDraftFilters({ ...draftFilters, dateRange: e.target.value })} className="bg-transparent focus:outline-none cursor-pointer">
                {DATE_RANGES.map((range) => (<option key={range.value} value={range.value}>{range.label}</option>))}
              </select>
            ) : (
              <select aria-label="Date range (not applicable to this report)" value="today" disabled className="bg-transparent focus:outline-none cursor-not-allowed">
                <option value="today">As of today</option>
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700">
            <Tag className="w-4 h-4 text-slate-400" />
            <select aria-label="Category" value={draftFilters.categoryId} onChange={(e) => setDraftFilters({ ...draftFilters, categoryId: e.target.value })} className="bg-transparent focus:outline-none cursor-pointer">
              <option value="all">All Categories</option>
              {lookups.categories.map((category) => (<option key={category.id} value={category.id}>{category.name}</option>))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700">
            <Package className="w-4 h-4 text-slate-400" />
            <select aria-label="Item" value={draftFilters.itemId} onChange={(e) => setDraftFilters({ ...draftFilters, itemId: e.target.value })} className="bg-transparent focus:outline-none cursor-pointer max-w-[160px]">
              <option value="all">All Items</option>
              {/* Deactivated (archived) items stay selectable: their past movements are still part of the reports. */}
              {lookups.items.map((item) => (<option key={item.id} value={item.id}>{item.name}{item.archived ? ' (deactivated)' : ''}</option>))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={handleGenerateReport} className="px-4 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition cursor-pointer">
            <Play className="w-3.5 h-3.5 fill-current" /> Generate Report
          </button>
          <button type="button" onClick={handleClearFilters} className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition cursor-pointer px-2 py-1">
            <X className="w-3.5 h-3.5" /> Clear filter
          </button>
        </div>
      </div>

      {/* The table is the main element; the chart of the same filtered report sits to its left on
          wide screens and below it on smaller ones. Both cards stretch to the same height. */}
      <div className="grid grid-cols-1 xl:grid-cols-[21rem_minmax(0,1fr)] gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0 flex flex-col">
          {/* No minimum width and no scroll container: the cells wrap, so the whole table always
              fits its card. It takes the spare height, keeping the pagination at the bottom.
              Below 640px the name initials are left out and headings are a little smaller, so the
              four columns keep room for their text; in the rows a very long word may break
              anywhere rather than push the table wider than the screen. */}
          <div className="flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-wide sm:tracking-wider bg-slate-50/50">
                  {view.columns.map((column, index) => {
                    const isLast = index === view.columns.length - 1;
                    // Headings wrap only between words, never inside one.
                    return (
                      <th key={column} className={`py-3 px-3 sm:px-5 ${isLast ? 'text-right' : ''}`}>
                        {column}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                <TableState
                  colSpan={4}
                  loading={loading}
                  empty={report.rows.length === 0}
                  loadingMessage="Loading report data..."
                  emptyMessage={error ? 'The report could not be loaded.' : 'No records found matching your filters.'}
                >
                  {report.rows.map((row) => {
                    const name = lookups.itemName(row.itemId);
                    const cells = view.row(row, lookups);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-3 sm:px-5 [overflow-wrap:anywhere]">
                          <div className="flex items-center gap-3">
                            <div aria-hidden="true" className="w-7 h-7 rounded-full bg-[#115e54]/10 text-[#115e54] hidden sm:flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                              {getInitial(name)}
                            </div>
                            <div className="font-extrabold text-slate-900">{name}</div>
                          </div>
                        </td>

                        <td className="py-3.5 px-3 sm:px-5 text-slate-500 [overflow-wrap:anywhere]">{cells.secondary}</td>

                        <td className="py-3.5 px-3 sm:px-5 font-extrabold text-slate-900 [overflow-wrap:anywhere]">
                          <div>{cells.quantity}</div>
                          {cells.note && <div className="text-[11px] text-slate-400 font-bold mt-1">{cells.note}</div>}
                        </td>

                        <td className="py-3.5 px-3 sm:px-5 text-right font-extrabold text-[#115e54] [overflow-wrap:anywhere]">
                          {cells.badgeClass ? (
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${cells.badgeClass}`}>{cells.value}</span>
                          ) : cells.value}
                        </td>
                      </tr>
                    );
                  })}
                </TableState>
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
            <button type="button" onClick={() => setPage(pagination.page - 1)} disabled={loading || pagination.page <= 1} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:bg-white">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <div className="flex items-center gap-1">
              {getPageWindow(pagination.page, pagination.totalPages).map((pageNumber) => (
                <button
                  type="button"
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  aria-current={pageNumber === pagination.page ? 'page' : undefined}
                  className={`w-8 h-8 rounded-lg text-xs font-extrabold flex items-center justify-center transition cursor-pointer ${pageNumber === pagination.page ? 'bg-[#115e54] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setPage(pagination.page + 1)} disabled={loading || pagination.page >= pagination.totalPages} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:bg-white">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-5 xl:order-first">
          <h3 className="text-sm font-extrabold text-slate-900">Inventory Distribution</h3>
          <div className="flex-1 flex flex-col sm:flex-row xl:flex-col items-center justify-center gap-6">
            <div
              role="img"
              aria-label={`Distribution of ${view.centerLabel}: ${chartSegments.map((segment) => `${segment.label} ${view.chartValue(segment.value)}`).join(', ')}`}
              className="relative w-44 h-44 rounded-full flex items-center justify-center shadow-inner shrink-0"
              style={{ background: buildDonutGradient(chartSegments.map((segment) => segment.value)) }}
            >
              <div className="w-28 h-28 bg-white rounded-full flex flex-col items-center justify-center shadow-sm text-center px-1">
                <span className="text-[10px] text-slate-400 font-bold">Distribution</span>
                <span className="text-xs font-extrabold text-slate-900 mt-0.5">{view.centerLabel}</span>
              </div>
            </div>

            <ul className="w-full sm:w-auto xl:w-full flex flex-col gap-2.5 text-xs font-bold">
              {chartSegments.map((segment, index) => (
                <li key={segment.label} className="flex items-center gap-2">
                  <span aria-hidden="true" className={`w-3 h-3 rounded-full shrink-0 ${LEGEND_DOT_CLASSES[index]}`}></span>
                  <span className="text-slate-600 flex-1">{segment.label}</span>
                  <span className="text-slate-900 font-extrabold sm:ml-4 xl:ml-0">{view.chartValue(segment.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
};

export default ReportsPage;
