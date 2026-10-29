import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldAlert,
  RotateCcw,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  Eye,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  Sparkles,
  X,
  AlertTriangle,
  ArrowRight,
  Send,
} from "lucide-react";
import {
  fetchDLQJobsApi,
  retryDLQJobApi,
  retryAllDLQJobsApi,
  deleteDLQJobApi,
  clearAllDLQJobsApi,
} from "../api/notificationApi";

export const DLQ = () => {
  const navigate = useNavigate();

  // State: Jobs list & pagination
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // State: Filter & Search
  const [searchQuery, setSearchQuery] = useState("");

  // State: Action loading states
  const [retryingJobId, setRetryingJobId] = useState(null);
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  // State: Feedback notice
  const [notice, setNotice] = useState(null);

  // State: Payload Inspection Modal
  const [selectedJob, setSelectedJob] = useState(null);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Fetch jobs from backend API
  const loadDLQJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchDLQJobsApi({ page, limit });
      if (res?.data?.jobs) {
        setJobs(res.data.jobs);
        setTotalCount(res.pagination?.totalCount || res.data.jobs.length);
      } else {
        setJobs([]);
        setTotalCount(0);
      }
    } catch (err) {
      console.error("Failed to load DLQ jobs:", err);
      setError(
        err?.response?.data?.message || err.message || "Failed to load Dead-Letter Queue"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDLQJobs();
  }, [page, limit]);

  // Filtered jobs based on search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter((j) => {
      const inId = String(j.id).toLowerCase().includes(q);
      const inOriginalId = String(j.originalJobId || "").toLowerCase().includes(q);
      const inNotifId = String(j.notificationId || "").toLowerCase().includes(q);
      const inReason = String(j.failedReason || "").toLowerCase().includes(q);
      const inTitle = String(j.payload?.title || j.payload?.subject || "").toLowerCase().includes(q);
      return inId || inOriginalId || inNotifId || inReason || inTitle;
    });
  }, [jobs, searchQuery]);

  // Retry individual job
  const handleRetryJob = async (jobId) => {
    try {
      setRetryingJobId(jobId);
      const res = await retryDLQJobApi(jobId);
      setNotice({
        type: "success",
        text: res.message || `Job #${jobId} re-enqueued successfully!`,
      });
      await loadDLQJobs();
      setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      console.error("Failed to retry job:", err);
      setNotice({
        type: "error",
        text: err?.response?.data?.message || err.message || "Failed to retry job",
      });
    } finally {
      setRetryingJobId(null);
    }
  };

  // Delete individual job
  const handleDeleteJob = async (jobId) => {
    if (!window.confirm(`Permanently remove job #${jobId} from Dead-Letter Queue?`)) {
      return;
    }

    try {
      setDeletingJobId(jobId);
      const res = await deleteDLQJobApi(jobId);
      setNotice({
        type: "success",
        text: res.message || `Job #${jobId} removed from DLQ.`,
      });
      await loadDLQJobs();
      setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      console.error("Failed to delete job:", err);
      setNotice({
        type: "error",
        text: err?.response?.data?.message || err.message || "Failed to delete job",
      });
    } finally {
      setDeletingJobId(null);
    }
  };

  // Retry all jobs
  const handleRetryAll = async () => {
    if (!window.confirm(`Retry up to 50 jobs currently staged in the Dead-Letter Queue?`)) {
      return;
    }

    try {
      setRetryingAll(true);
      const res = await retryAllDLQJobsApi();
      setNotice({
        type: "success",
        text: res.message || "Bulk retry initiated successfully!",
      });
      await loadDLQJobs();
      setTimeout(() => setNotice(null), 5000);
    } catch (err) {
      console.error("Failed bulk retry:", err);
      setNotice({
        type: "error",
        text: err?.response?.data?.message || err.message || "Bulk retry failed",
      });
    } finally {
      setRetryingAll(false);
    }
  };

  // Purge / Clear all jobs
  const handleClearAll = async () => {
    if (
      !window.confirm(
        "CAUTION: Are you sure you want to permanently PURGE ALL jobs in the Dead-Letter Queue? This action cannot be reversed."
      )
    ) {
      return;
    }

    try {
      setClearingAll(true);
      const res = await clearAllDLQJobsApi();
      setNotice({
        type: "success",
        text: res.message || "All DLQ jobs have been purged.",
      });
      await loadDLQJobs();
      setTimeout(() => setNotice(null), 5000);
    } catch (err) {
      console.error("Failed to clear DLQ:", err);
      setNotice({
        type: "error",
        text: err?.response?.data?.message || err.message || "Failed to clear DLQ",
      });
    } finally {
      setClearingAll(false);
    }
  };

  // Copy JSON payload
  const handleCopyPayload = (payload) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Test failed payload in Sandbox
  const handleSendToSandbox = (job) => {
    const payload = job.payload || {};
    navigate("/sandbox", {
      state: {
        presetTitle: payload.title || payload.subject || "Retried DLQ Notification",
        presetMessage: payload.message || payload.body || "Replaying failed payload from DLQ.",
        presetCategory: payload.category || "ALERT",
        presetChannels: payload.channels || ["IN_APP", "PUSH"],
      },
    });
  };

  return (
    <div className="p-8 space-y-8 bg-[#07090E] min-h-screen text-zinc-100">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-rose-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-950/30">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              Dead-Letter Queue (DLQ)
              <span
                className={`text-xs font-mono px-2.5 py-0.5 rounded-full border font-semibold ${
                  totalCount > 0
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                }`}
              >
                {totalCount} Pending
              </span>
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Triage, inspect, and replay background dispatch jobs that exceeded maximum BullMQ retry attempts
            </p>
          </div>
        </div>

        {/* Global DLQ Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={loadDLQJobs}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
            title="Refresh DLQ jobs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={handleRetryAll}
            disabled={retryingAll || totalCount === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold text-sm shadow-lg shadow-amber-950/40 transition-all flex items-center gap-2 disabled:opacity-40"
          >
            <RotateCcw className={`w-4 h-4 ${retryingAll ? "animate-spin" : ""}`} />
            {retryingAll ? "Retrying..." : "Retry All Batch"}
          </button>

          <button
            onClick={handleClearAll}
            disabled={clearingAll || totalCount === 0}
            className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            Purge All
          </button>
        </div>
      </div>

      {/* ── Status Feedback Alert ── */}
      {notice && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between shadow-lg transition-all ${
            notice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-emerald-950/20"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-rose-950/20"
          }`}
        >
          <div className="flex items-center gap-3">
            {notice.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{notice.text}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-zinc-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-xl shadow-black/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              DLQ Staged Jobs
            </span>
            <AlertOctagon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-white mt-2 font-mono">
            {totalCount}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Jobs isolated after 3 consecutive dispatch failures
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-xl shadow-black/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Isolation Queue
            </span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-sm font-bold text-cyan-300 mt-3 font-mono">
            notification-dlq
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Dedicated BullMQ store on distributed Redis
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-xl shadow-black/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Queue Health
            </span>
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                totalCount === 0 ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
              }`}
            />
          </div>
          <div
            className={`text-lg font-bold mt-2 ${
              totalCount === 0 ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {totalCount === 0 ? "Healthy — 0 Failures" : "Intervention Required"}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {totalCount === 0
              ? "All notification pipelines operating within nominal parameters"
              : "Review failed payloads or downstream provider connectivity"}
          </div>
        </div>
      </div>

      {/* ── Toolbar: Search & Pagination Selector ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 shadow-xl shadow-black/40">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by Job ID, Notification ID, or error reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800/90 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>Items per page:</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value));
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white font-mono focus:outline-none focus:border-cyan-500"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {/* ── Main Data Table / List ── */}
      {loading ? (
        <div className="p-16 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-sm font-mono text-zinc-400">Loading Dead-Letter Queue items...</p>
        </div>
      ) : error ? (
        <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-center space-y-3 max-w-xl mx-auto">
          <AlertTriangle className="w-8 h-8 mx-auto text-rose-400" />
          <h3 className="text-lg font-semibold">Failed to Access DLQ</h3>
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            onClick={loadDLQJobs}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs font-medium hover:bg-zinc-800"
          >
            Retry Connection
          </button>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="p-16 rounded-2xl bg-[#0B0D13]/80 border border-zinc-800/80 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/30">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {searchQuery ? "No Matching DLQ Jobs" : "Dead-Letter Queue is Clean!"}
            </h3>
            <p className="text-sm text-zinc-400 max-w-md mx-auto mt-1">
              {searchQuery
                ? `No jobs match "${searchQuery}". Clear your search query to see all staged items.`
                : "All notifications are successfully traversing BullMQ workers without hitting terminal failure thresholds."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 overflow-hidden shadow-2xl shadow-black/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-950/90 border-b border-zinc-800/80 text-zinc-400 font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-4 font-semibold">Job ID</th>
                  <th className="py-3.5 px-4 font-semibold">Notification & Scope</th>
                  <th className="py-3.5 px-4 font-semibold">Failure Diagnostics</th>
                  <th className="py-3.5 px-4 font-semibold">Failed At</th>
                  <th className="py-3.5 px-4 font-semibold text-center">Attempts</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-zinc-900/40 transition-colors group"
                  >
                    {/* Job ID */}
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-400/90 whitespace-nowrap">
                      #{job.id}
                      <span className="block text-[10px] text-zinc-500 font-normal truncate max-w-[120px]">
                        {job.originalJobId}
                      </span>
                    </td>

                    {/* Notification ID & Title */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white tracking-tight line-clamp-1">
                        {job.payload?.title || job.payload?.subject || "Notification"}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1.5">
                        <span className="text-cyan-400">ID:</span>
                        <span>{job.notificationId || "N/A"}</span>
                        <span className="text-zinc-600">|</span>
                        <span className="text-zinc-500">Tenant: {job.tenantId}</span>
                      </div>
                    </td>

                    {/* Failure Reason */}
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-[11px] leading-tight line-clamp-2">
                        {job.failedReason}
                      </div>
                    </td>

                    {/* Failed At */}
                    <td className="py-3.5 px-4 text-zinc-400 whitespace-nowrap font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{new Date(job.failedAt).toLocaleDateString()}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 block">
                        {new Date(job.failedAt).toLocaleTimeString()}
                      </span>
                    </td>

                    {/* Attempts */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-amber-400 font-mono font-bold text-[11px]">
                        {job.attemptsMade} / 3
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Payload */}
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                          title="Inspect Job Payload"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Retry */}
                        <button
                          onClick={() => handleRetryJob(job.id)}
                          disabled={retryingJobId === job.id}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-amber-200 font-semibold text-[11px] flex items-center gap-1 transition-all disabled:opacity-40"
                          title="Re-enqueue job into active dispatch pipeline"
                        >
                          <RotateCcw
                            className={`w-3 h-3 ${
                              retryingJobId === job.id ? "animate-spin" : ""
                            }`}
                          />
                          <span>Retry</span>
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          disabled={deletingJobId === job.id}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/20 border border-zinc-800 hover:border-rose-500/30 text-zinc-500 hover:text-rose-400 transition-colors"
                          title="Delete from DLQ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
            <div>
              Showing {filteredJobs.length} of {totalCount} total dead-letter jobs
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-30 hover:border-zinc-700 text-zinc-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * limit >= totalCount}
                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 disabled:opacity-30 hover:border-zinc-700 text-zinc-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payload Inspection Modal ── */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-[#0B0D13] border border-zinc-800 rounded-3xl shadow-2xl shadow-black/90 overflow-hidden my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-950/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    DLQ Job #{selectedJob.id}
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                      Attempts: {selectedJob.attemptsMade}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">
                    Original ID: {selectedJob.originalJobId}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedJob(null)}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto font-mono text-xs">
              {/* Failure Diagnostics Box */}
              <div>
                <label className="text-[11px] text-zinc-400 font-sans uppercase font-bold tracking-wider block mb-1.5">
                  Terminal Failure Reason
                </label>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs leading-relaxed">
                  {selectedJob.failedReason}
                </div>
              </div>

              {/* JSON Payload Viewer */}
              <div>
                <div className="flex items-center justify-between mb-1.5 font-sans">
                  <label className="text-[11px] text-zinc-400 uppercase font-bold tracking-wider">
                    Notification Payload
                  </label>
                  <button
                    onClick={() => handleCopyPayload(selectedJob.payload)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    {copiedPayload ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs overflow-x-auto leading-relaxed">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800/80 bg-zinc-950/60">
              <button
                onClick={() => handleSendToSandbox(selectedJob)}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Test in Sandbox</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedJob(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-medium"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    const id = selectedJob.id;
                    setSelectedJob(null);
                    await handleRetryJob(id);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-950/40 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry Job Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DLQ;
