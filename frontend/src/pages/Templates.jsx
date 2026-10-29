import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileCode2,
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  Copy,
  Sparkles,
  Smartphone,
  Bell,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  X,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import {
  fetchTemplatesApi,
  createTemplateApi,
  updateTemplateApi,
  deleteTemplateApi,
} from "../api/notificationApi";

// Categories available in the engine
const CATEGORIES = ["ALL", "SYSTEM", "ALERT", "BOOKING", "SECURITY", "PAYMENT", "GENERAL"];

// Category pill colors
const CATEGORY_COLORS = {
  ALERT: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  SECURITY: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  SYSTEM: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  BOOKING: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  PAYMENT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  GENERAL: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

// Available Channels
const ALL_CHANNELS = [
  { id: "IN_APP", label: "In-App Notification", icon: Bell, desc: "Realtime WebSocket UI delivery" },
  { id: "PUSH", label: "Push Notification", icon: Smartphone, desc: "FCM / APNs mobile delivery" },
];

// Helper to extract Handlebars {{variables}} from string
const extractVariables = (str = "") => {
  const matches = str.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/[{}]/g, "").trim()))];
};

// Helper to compile/replace Handlebars variables with sample data
const renderTemplateString = (templateStr = "", sampleData = {}) => {
  if (!templateStr) return "";
  return templateStr.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    return sampleData[key] !== undefined && sampleData[key] !== ""
      ? sampleData[key]
      : match;
  });
};

// Default mock dictionary for known variable names
const DEFAULT_MOCK_DATA = {
  userName: "Alex Morgan",
  name: "Alex",
  customerName: "Kasun Perera",
  orderId: "ORD-9421",
  trackingNumber: "TRK-77042",
  eta: "Tomorrow by 5 PM",
  serviceName: "Realtime WebSocket Hub",
  date: "Sunday, Nov 2",
  startTime: "02:00 UTC",
  endTime: "02:30 UTC",
  location: "Colombo, LK",
  device: "Chrome / Linux x86_64",
  time: "17:15 UTC",
  amount: "$149.50",
  code: "892104",
  ticketId: "TCK-4081",
};

export const Templates = () => {
  const navigate = useNavigate();

  // State: List
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedChannelFilter, setSelectedChannelFilter] = useState("ALL");

  // State: Modal Form (Create / Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("GENERAL");
  const [formChannels, setFormChannels] = useState(["IN_APP", "PUSH"]);
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSampleData, setFormSampleData] = useState({});

  // Active preview tab inside modal
  const [previewTab, setPreviewTab] = useState("inapp"); // 'inapp' | 'push'

  // Toast / feedback message
  const [actionNotice, setActionNotice] = useState(null);

  // Load templates from API
  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchTemplatesApi();
      if (res && res.data && Array.isArray(res.data.templates)) {
        setTemplates(res.data.templates);
      } else {
        setTemplates([]);
      }
    } catch (err) {
      console.error("Failed to load templates:", err);
      setError(err?.response?.data?.message || err.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Filtered Templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      // Category filter
      if (selectedCategory !== "ALL" && t.category !== selectedCategory) {
        return false;
      }
      // Channel filter
      if (
        selectedChannelFilter !== "ALL" &&
        (!t.channels || !t.channels.includes(selectedChannelFilter))
      ) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inName = (t.name || "").toLowerCase().includes(q);
        const inSubject = (t.subject || "").toLowerCase().includes(q);
        const inBody = (t.body || "").toLowerCase().includes(q);
        const inDesc = (t.description || "").toLowerCase().includes(q);
        if (!inName && !inSubject && !inBody && !inDesc) return false;
      }
      return true;
    });
  }, [templates, selectedCategory, selectedChannelFilter, searchQuery]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormCategory("GENERAL");
    setFormChannels(["IN_APP", "PUSH"]);
    setFormSubject("");
    setFormBody("");
    setFormDescription("");
    setFormSampleData({ ...DEFAULT_MOCK_DATA });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (template) => {
    setEditingTemplate(template);
    setFormName(template.name || "");
    setFormCategory(template.category || "GENERAL");
    setFormChannels(Array.isArray(template.channels) ? template.channels : ["IN_APP"]);
    setFormSubject(template.subject || "");
    setFormBody(template.body || "");
    setFormDescription(template.description || "");
    setFormSampleData({
      ...DEFAULT_MOCK_DATA,
      ...(template.sampleData || {}),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle Channel toggle
  const toggleChannel = (channelId) => {
    if (formChannels.includes(channelId)) {
      if (formChannels.length === 1) return; // Must keep at least 1
      setFormChannels(formChannels.filter((c) => c !== channelId));
    } else {
      setFormChannels([...formChannels, channelId]);
    }
  };

  // Detected variables from current form subject & body
  const detectedVariables = useMemo(() => {
    const fromSubject = extractVariables(formSubject);
    const fromBody = extractVariables(formBody);
    return [...new Set([...fromSubject, ...fromBody])];
  }, [formSubject, formBody]);

  // Ensure sample data has an entry for all detected variables
  useEffect(() => {
    setFormSampleData((prev) => {
      const updated = { ...prev };
      detectedVariables.forEach((v) => {
        if (updated[v] === undefined) {
          updated[v] = DEFAULT_MOCK_DATA[v] || `Sample_${v}`;
        }
      });
      return updated;
    });
  }, [detectedVariables]);

  // Live rendered values
  const renderedSubject = useMemo(() => {
    return renderTemplateString(formSubject, formSampleData);
  }, [formSubject, formSampleData]);

  const renderedBody = useMemo(() => {
    return renderTemplateString(formBody, formSampleData);
  }, [formBody, formSampleData]);

  // Save handler (Create or Update)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Template Name is required (e.g. order_confirmed).");
      return;
    }
    if (!formSubject.trim()) {
      setFormError("Subject line is required.");
      return;
    }
    if (!formBody.trim()) {
      setFormError("Body message is required.");
      return;
    }
    if (formChannels.length === 0) {
      setFormError("Please select at least one delivery channel.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name: formName.trim().toLowerCase().replace(/\s+/g, "_"),
      category: formCategory,
      channels: formChannels,
      subject: formSubject.trim(),
      body: formBody.trim(),
      description: formDescription.trim(),
      sampleData: formSampleData,
    };

    try {
      if (editingTemplate) {
        await updateTemplateApi(editingTemplate._id, payload);
        setActionNotice({
          type: "success",
          text: `Template "${payload.name}" updated successfully!`,
        });
      } else {
        await createTemplateApi(payload);
        setActionNotice({
          type: "success",
          text: `Template "${payload.name}" created successfully!`,
        });
      }
      setIsModalOpen(false);
      await loadTemplates();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err) {
      console.error("Save template error:", err);
      setFormError(
        err?.response?.data?.message || err.message || "Failed to save template"
      );
    } finally {
      setSaving(false);
    }
  };

  // Delete Handler
  const handleDelete = async (template) => {
    if (
      !window.confirm(
        `Are you sure you want to delete template "${template.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await deleteTemplateApi(template._id);
      setActionNotice({
        type: "success",
        text: `Template "${template.name}" has been deleted.`,
      });
      await loadTemplates();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err) {
      console.error("Delete error:", err);
      alert(err?.response?.data?.message || err.message || "Failed to delete");
    }
  };

  // Duplicate Handler
  const handleDuplicate = (template) => {
    setEditingTemplate(null);
    setFormName(`${template.name}_copy`);
    setFormCategory(template.category);
    setFormChannels(template.channels || ["IN_APP"]);
    setFormSubject(template.subject);
    setFormBody(template.body);
    setFormDescription(template.description || "");
    setFormSampleData(template.sampleData || { ...DEFAULT_MOCK_DATA });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Insert Variable into Body at cursor
  const handleInsertVariable = (varName) => {
    const token = `{{${varName}}}`;
    setFormBody((prev) => `${prev} ${token}`);
  };

  // Quick Dispatch in Sandbox
  const handleOpenInSandbox = (template) => {
    const resolvedSubject = renderTemplateString(
      template.subject,
      template.sampleData || DEFAULT_MOCK_DATA
    );
    const resolvedBody = renderTemplateString(
      template.body,
      template.sampleData || DEFAULT_MOCK_DATA
    );

    navigate("/sandbox", {
      state: {
        presetTitle: resolvedSubject,
        presetMessage: resolvedBody,
        presetCategory: template.category,
        presetChannels: template.channels,
      },
    });
  };

  return (
    <div className="p-8 space-y-8 bg-[#07090E] min-h-screen text-zinc-100">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/30">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Message Templates
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                  {templates.length} Active
                </span>
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Standardized blueprints with dynamic Handlebars variables for multi-channel dispatch
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadTemplates}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
            title="Refresh templates from database"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-lg shadow-cyan-950/50 hover:shadow-cyan-900/40 transition-all flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        </div>
      </div>

      {/* ── Notification Feedback Alert ── */}
      {actionNotice && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
            actionNotice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{actionNotice.text}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Filter & Search Toolbar ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 backdrop-blur-xl shadow-xl shadow-black/40">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search templates by name, subject, or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800/90 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
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

        {/* Filter Pills */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
          {/* Category Dropdown/Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80 text-xs">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  selectedCategory === cat
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Channel selector */}
          <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80 text-xs">
            {["ALL", "IN_APP", "PUSH"].map((ch) => (
              <button
                key={ch}
                onClick={() => setSelectedChannelFilter(ch)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  selectedChannelFilter === ch
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                {ch === "IN_APP" && <Bell className="w-3 h-3 text-cyan-400" />}
                {ch === "PUSH" && <Smartphone className="w-3 h-3 text-emerald-400" />}
                {ch === "ALL" ? "All Channels" : ch}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Template Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-zinc-900/50 border border-zinc-800/60 p-6 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-5 bg-zinc-800 rounded w-1/3" />
                <div className="h-6 bg-zinc-800/60 rounded w-3/4" />
                <div className="h-12 bg-zinc-800/40 rounded w-full" />
              </div>
              <div className="h-8 bg-zinc-800/60 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-center space-y-3 max-w-xl mx-auto my-12">
          <AlertCircle className="w-8 h-8 mx-auto text-rose-400" />
          <h3 className="text-lg font-semibold">Failed to Load Templates</h3>
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            onClick={loadTemplates}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="p-12 rounded-2xl bg-[#0B0D13]/70 border border-zinc-800/80 text-center space-y-4 max-w-lg mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <FileCode2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">No Templates Found</h3>
            <p className="text-sm text-zinc-400 mt-1">
              {searchQuery || selectedCategory !== "ALL" || selectedChannelFilter !== "ALL"
                ? "No templates match your active filters. Try resetting the search or category."
                : "Get started by creating your first reusable message template."}
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-cyan-950/40 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => {
            const vars = extractVariables(`${template.subject} ${template.body}`);
            const categoryBadge = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.GENERAL;

            return (
              <div
                key={template._id}
                className="group relative rounded-2xl bg-[#0B0D13]/90 border border-zinc-800/80 hover:border-zinc-700/90 transition-all duration-300 p-6 flex flex-col justify-between shadow-xl shadow-black/40 hover:shadow-cyan-950/10 hover:-translate-y-0.5"
              >
                {/* Top Section */}
                <div className="space-y-4">
                  {/* Category & Channels */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${categoryBadge}`}
                    >
                      {template.category}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {template.channels?.includes("IN_APP") && (
                        <span
                          title="Supports In-App Notification"
                          className="p-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        >
                          <Bell className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {template.channels?.includes("PUSH") && (
                        <span
                          title="Supports Mobile Push Notification"
                          className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Template Name & Subject */}
                  <div>
                    <div className="font-mono text-xs text-cyan-400/80 mb-1 flex items-center gap-1.5">
                      <span>#{template.name}</span>
                    </div>
                    <h3 className="text-base font-bold text-white tracking-tight group-hover:text-cyan-200 transition-colors line-clamp-1">
                      {template.subject}
                    </h3>
                  </div>

                  {/* Body Preview */}
                  <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed bg-zinc-950/70 p-3 rounded-xl border border-zinc-800/60 font-mono">
                    {template.body}
                  </p>

                  {/* Detected Variables Tags */}
                  {vars.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-medium text-zinc-500 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        <span>Dynamic Variables ({vars.length}):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {vars.map((v) => (
                          <span
                            key={v}
                            className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300"
                          >
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Description note if any */}
                  {template.description && (
                    <p className="text-[11px] text-zinc-500 italic line-clamp-1">
                      {template.description}
                    </p>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-5 mt-5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(template)}
                      className="p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors"
                      title="Edit Template"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDuplicate(template)}
                      className="p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors"
                      title="Duplicate Template"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(template)}
                      className="p-2 rounded-lg bg-zinc-900/80 hover:bg-rose-500/20 border border-zinc-800 hover:border-rose-500/30 text-zinc-400 hover:text-rose-400 transition-colors"
                      title="Delete Template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleOpenInSandbox(template)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                    title="Open in Sandbox with populated fields"
                  >
                    <span>Test in Sandbox</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-[#0B0D13] border border-zinc-800 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-950/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  {editingTemplate ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {editingTemplate ? `Edit Template: ${editingTemplate.name}` : "Create New Template"}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Configure channel targets, Handlebars syntax, and view the real-time compiled preview
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner in modal */}
            {formError && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Modal Grid: Form on Left, Live Preview on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/80 max-h-[75vh] overflow-y-auto">
              {/* Left Column: Form Fields (7 cols) */}
              <form onSubmit={handleSave} className="lg:col-span-7 p-6 space-y-5">
                {/* Row 1: Name & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Template Identifier <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. order_shipped"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                      required
                    />
                    <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                      Snake_case key used in API dispatch
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Category
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                    >
                      {CATEGORIES.filter((c) => c !== "ALL").map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Delivery Channels */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Delivery Channels <span className="text-cyan-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {ALL_CHANNELS.map((ch) => {
                      const Icon = ch.icon;
                      const isSelected = formChannels.includes(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => toggleChannel(ch.id)}
                          className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                            isSelected
                              ? "bg-cyan-500/10 border-cyan-500/40 text-white shadow-sm shadow-cyan-950/20"
                              : "bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isSelected
                                ? "bg-cyan-500 text-zinc-950 font-bold"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">{ch.label}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">{ch.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subject Line */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-300">
                      Subject / Title <span className="text-cyan-400">*</span>
                    </label>
                    <span className="text-[10px] text-zinc-500">Supports &#123;&#123;variables&#125;&#125;</span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 📦 Your order #{{orderId}} is on its way!"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                    required
                  />
                </div>

                {/* Body Message */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-300">
                      Body Text / Template Content <span className="text-cyan-400">*</span>
                    </label>
                    <span className="text-[10px] text-zinc-500">Handlebars syntax</span>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="e.g. Hello {{userName}}, your package has been shipped via {{courier}} with tracking number {{trackingNo}}."
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                    required
                  />

                  {/* Quick-insert variable helpers */}
                  <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                    <span className="text-zinc-500 text-[10px] whitespace-nowrap">Quick insert:</span>
                    {["userName", "orderId", "date", "location", "amount"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleInsertVariable(v)}
                        className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:border-cyan-500/40 text-cyan-400 font-mono transition-colors whitespace-nowrap"
                      >
                        +{`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Internal Description / Usage Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sent automatically by warehouse dispatch hook"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </form>

              {/* Right Column: Live Compiled Preview (5 cols) */}
              <div className="lg:col-span-5 p-6 bg-zinc-950/40 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  {/* Preview Header & Channel Switcher */}
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Live Preview
                      </span>
                    </div>

                    <div className="flex items-center p-0.5 bg-zinc-900 rounded-lg border border-zinc-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setPreviewTab("inapp")}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                          previewTab === "inapp"
                            ? "bg-cyan-500 text-zinc-950 font-bold shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <Bell className="w-3 h-3" />
                        In-App
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab("push")}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                          previewTab === "push"
                            ? "bg-emerald-500 text-zinc-950 font-bold shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <Smartphone className="w-3 h-3" />
                        Push
                      </button>
                    </div>
                  </div>

                  {/* Preview Render Area */}
                  {previewTab === "inapp" ? (
                    /* In-App Notification Card Preview */
                    <div className="p-4 rounded-2xl bg-[#0F121C] border border-cyan-500/30 shadow-xl shadow-cyan-950/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                            🔔
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-white">
                              Notification Engine
                            </span>
                            <span className="text-[10px] text-zinc-500 block">Just now</span>
                          </div>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="text-sm font-bold text-white tracking-tight">
                          {renderedSubject || (
                            <span className="text-zinc-600 italic">Subject line preview...</span>
                          )}
                        </h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {renderedBody || (
                            <span className="text-zinc-600 italic">
                              Template body with replaced variables will appear here...
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                        <span>Category: {formCategory}</span>
                        <span className="text-cyan-400">Click to View &rarr;</span>
                      </div>
                    </div>
                  ) : (
                    /* Mobile Push Lockscreen Preview */
                    <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-2.5 max-w-sm mx-auto">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 pb-1 border-b border-zinc-800/60">
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-semibold text-zinc-200">ADMIN ENGINE</span>
                        </div>
                        <span className="text-[10px]">now</span>
                      </div>

                      <div>
                        <h5 className="text-xs font-bold text-white">
                          {renderedSubject || "Push Notification Title"}
                        </h5>
                        <p className="text-xs text-zinc-300 mt-0.5 line-clamp-3 leading-relaxed">
                          {renderedBody || "Push message content with replaced mock variables..."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Sample Mock Data Editor */}
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                        Mock Variable Values ({detectedVariables.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormSampleData({ ...DEFAULT_MOCK_DATA })}
                        className="text-[10px] text-cyan-400 hover:underline"
                      >
                        Reset defaults
                      </button>
                    </div>

                    {detectedVariables.length === 0 ? (
                      <p className="text-[11px] text-zinc-500 italic p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 text-center">
                        No variables detected yet. Add &#123;&#123;yourVariable&#125;&#125; in subject or body.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-36 overflow-y-auto p-2 bg-zinc-950 rounded-xl border border-zinc-800/80">
                        {detectedVariables.map((v) => (
                          <div key={v} className="flex items-center gap-2 text-xs">
                            <span className="w-28 font-mono text-[11px] text-cyan-400 truncate">
                              {`{{${v}}}`}
                            </span>
                            <input
                              type="text"
                              value={formSampleData[v] || ""}
                              onChange={(e) =>
                                setFormSampleData({
                                  ...formSampleData,
                                  [v]: e.target.value,
                                })
                              }
                              placeholder={`Mock ${v}`}
                              className="flex-1 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/50 transition-all flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : editingTemplate ? (
                      "Update Template"
                    ) : (
                      "Save Template"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Templates;
