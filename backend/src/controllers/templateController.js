const NotificationTemplate = require("../models/NotificationTemplate");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../errors/appError");
const logger = require("../utils/logger");
const { emitLiveLog } = require("../utils/adminLogEmitter");

// Starter templates for new instances
const DEFAULT_TEMPLATES = [
  {
    name: "security_alert",
    category: "SECURITY",
    channels: ["IN_APP", "PUSH"],
    subject: "🚨 Security Alert: New Login from {{location}}",
    body: "Hi {{userName}}, we detected a new login to your account from {{device}} near {{location}} at {{time}}. If this was not you, please secure your account immediately.",
    description: "Triggered whenever an unauthorized or unfamiliar IP attempts authentication.",
    sampleData: {
      userName: "Visun",
      location: "Colombo, LK",
      device: "Chrome / Linux x86_64",
      time: "17:15 UTC",
    },
  },
  {
    name: "order_dispatched",
    category: "BOOKING",
    channels: ["IN_APP", "PUSH"],
    subject: "📦 Order #{{orderId}} is on its way!",
    body: "Good news {{customerName}}! Your shipment (Ref: {{trackingNumber}}) has departed our fulfillment facility. Estimated arrival: {{eta}}.",
    description: "Customer status update upon courier package hand-off.",
    sampleData: {
      customerName: "Kasun Perera",
      orderId: "ORD-9421",
      trackingNumber: "TRK-77042",
      eta: "Tomorrow by 5 PM",
    },
  },
  {
    name: "system_maintenance",
    category: "SYSTEM",
    channels: ["IN_APP", "PUSH"],
    subject: "⚙️ Scheduled Maintenance: {{serviceName}}",
    body: "Notice: {{serviceName}} will undergo scheduled database optimizations on {{date}} between {{startTime}} and {{endTime}}. Service interruption will be minimal.",
    description: "Broadcast template for infrastructure operations notifications.",
    sampleData: {
      serviceName: "Realtime WebSocket Hub",
      date: "Sunday, Nov 2",
      startTime: "02:00 UTC",
      endTime: "02:30 UTC",
    },
  },
];

/**
 * GET /api/notifications/templates
 * Fetches all notification templates for the tenant with optional search & category filtering.
 */
exports.getAllTemplates = catchAsync(async (req, res) => {
  const tenantId =
    req.headers?.["x-tenant-id"] || req.user?.tenantId || req.query?.tenantId || "default";

  // Auto-seed starter templates if empty
  const count = await NotificationTemplate.countDocuments({ tenantId });
  if (count === 0 && tenantId === "default") {
    try {
      await NotificationTemplate.insertMany(
        DEFAULT_TEMPLATES.map((t) => ({ ...t, tenantId }))
      );
      logger.info(`✨ [Templates] Seeded ${DEFAULT_TEMPLATES.length} starter templates for tenant ${tenantId}`);
    } catch (seedErr) {
      logger.warn(`Could not seed default templates: ${seedErr.message}`);
    }
  }

  const query = { tenantId };

  if (req.query.category && req.query.category !== "ALL") {
    query.category = req.query.category.toUpperCase();
  }

  if (req.query.search) {
    const s = req.query.search.trim();
    query.$or = [
      { name: { $regex: s, $options: "i" } },
      { subject: { $regex: s, $options: "i" } },
      { body: { $regex: s, $options: "i" } },
    ];
  }

  const templates = await NotificationTemplate.find(query).sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: templates.length,
    data: { templates },
  });
});

/**
 * GET /api/notifications/templates/:id
 */
exports.getTemplateById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const template = await NotificationTemplate.findById(id);

  if (!template) {
    return next(new AppError(`No template found with ID: ${id}`, 404));
  }

  res.status(200).json({
    status: "success",
    data: { template },
  });
});

/**
 * POST /api/notifications/templates
 */
exports.createTemplate = catchAsync(async (req, res, next) => {
  const tenantId =
    req.headers?.["x-tenant-id"] || req.user?.tenantId || req.body?.tenantId || "default";

  const { name, category, channels, subject, body, description, sampleData } = req.body;

  if (!name || !subject || !body) {
    return next(new AppError("Name, subject, and body are required to create a template.", 400));
  }

  const existing = await NotificationTemplate.findOne({ tenantId, name: name.trim() });
  if (existing) {
    return next(new AppError(`A template named "${name.trim()}" already exists for this tenant.`, 409));
  }

  const template = await NotificationTemplate.create({
    name: name.trim(),
    category: category ? category.toUpperCase() : "GENERAL",
    channels: Array.isArray(channels) && channels.length > 0 ? channels : ["IN_APP"],
    subject: subject.trim(),
    body: body.trim(),
    description: description ? description.trim() : "",
    sampleData: sampleData && typeof sampleData === "object" ? sampleData : {},
    tenantId,
  });

  try {
    emitLiveLog({
      level: "SUCCESS",
      event: "TEMPLATE_CREATED",
      message: `Template "${template.name}" created under category [${template.category}]`,
      tenantId,
      details: {
        templateId: template._id,
        name: template.name,
        channels: template.channels,
        category: template.category,
      },
    });
  } catch (_) {}

  logger.info(`📝 [Templates] Created template "${template.name}" (ID: ${template._id}) [Tenant: ${tenantId}]`);

  res.status(201).json({
    status: "success",
    message: "Template created successfully",
    data: { template },
  });
});

/**
 * PUT /api/notifications/templates/:id
 */
exports.updateTemplate = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { name, category, channels, subject, body, description, sampleData } = req.body;

  const updateFields = {};
  if (name !== undefined) updateFields.name = name.trim();
  if (category !== undefined) updateFields.category = category.toUpperCase();
  if (channels !== undefined) updateFields.channels = channels;
  if (subject !== undefined) updateFields.subject = subject.trim();
  if (body !== undefined) updateFields.body = body.trim();
  if (description !== undefined) updateFields.description = description.trim();
  if (sampleData !== undefined) updateFields.sampleData = sampleData;

  const template = await NotificationTemplate.findByIdAndUpdate(id, updateFields, {
    new: true,
    runValidators: true,
  });

  if (!template) {
    return next(new AppError(`No template found with ID: ${id}`, 404));
  }

  try {
    emitLiveLog({
      level: "INFO",
      event: "TEMPLATE_UPDATED",
      message: `Template "${template.name}" was modified by admin`,
      tenantId: template.tenantId,
      details: {
        templateId: template._id,
        name: template.name,
        updatedFields: Object.keys(updateFields),
      },
    });
  } catch (_) {}

  logger.info(`✏️ [Templates] Updated template "${template.name}" (ID: ${template._id})`);

  res.status(200).json({
    status: "success",
    message: "Template updated successfully",
    data: { template },
  });
});

/**
 * DELETE /api/notifications/templates/:id
 */
exports.deleteTemplate = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const template = await NotificationTemplate.findByIdAndDelete(id);

  if (!template) {
    return next(new AppError(`No template found with ID: ${id}`, 404));
  }

  try {
    emitLiveLog({
      level: "WARN",
      event: "TEMPLATE_DELETED",
      message: `Template "${template.name}" was deleted permanently`,
      tenantId: template.tenantId,
      details: {
        templateId: template._id,
        name: template.name,
      },
    });
  } catch (_) {}

  logger.info(`🗑️ [Templates] Deleted template "${template.name}" (ID: ${template._id})`);

  res.status(200).json({
    status: "success",
    message: "Template deleted successfully",
    data: null,
  });
});
