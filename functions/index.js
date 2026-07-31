const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

initializeApp();

const db = getFirestore();
const resendApiKey = defineSecret("RESEND_API_KEY");
const ADMIN_EMAIL = "admin@brightlearnersacademy.net";
const STANDALONE_OWNER_EMAIL = "pekaric.arian@gmail.com";

async function standaloneOwnerIds() {
  const snapshot = await db.collection("users").get();
  return new Set(snapshot.docs
    .filter((item) => String(item.data().email || "").toLowerCase() === STANDALONE_OWNER_EMAIL)
    .map((item) => item.id));
}

async function isStandaloneOwner(userId) {
  if (!userId) return false;
  const snapshot = await db.collection("users").doc(userId).get();
  return String(snapshot.data()?.email || "").toLowerCase() === STANDALONE_OWNER_EMAIL;
}
const DEFAULT_PORTAL_URL = "https://bright-learners-staff-portal--bright-learners-academy-app.us-east4.hosted.app";
const PORTAL_URL = process.env.PORTAL_URL || DEFAULT_PORTAL_URL;
const FROM_EMAIL = "Bright Learners Staff Portal <notifications@notifications.brightlearnersacademy.net>";
const academyNames = ["Sundance", "Midnapore", "Sylvan Lake", "Millwoods", "Willowgrove"];
const directorEmails = {
  Sundance: "sundance@brightlearnersacademy.net",
  Midnapore: "midnapore@brightlearnersacademy.net",
  "Sylvan Lake": "sylvandaycare@gmail.com",
  Millwoods: "millwoods@brightlearnersacademy.net",
  Willowgrove: "willowgrove@brightlearnersacademy.net",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateLabel(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : new Date(value));
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-CA", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Regina",
      }).format(date);
}

function dateOnly(value, timeZone = "America/Regina") {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(value);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayDifference(today, due) {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const end = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((end - start) / 86400000);
}

function portalLink(path = "") {
  return `${PORTAL_URL.replace(/\/$/, "")}${path}`;
}

function emailShell({ preheader, heading, body, buttonLabel, buttonUrl, footer }) {
  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Didact+Gothic&family=Mulish:wght@400;600;700;800&family=Sniglet:wght@400;800&display=swap" rel="stylesheet">
  </head>
  <body style="margin:0;background:#f5f7f9;color:#17345b;font-family:Mulish,Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f9;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #d8e1e7;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(23,52,91,.08)">
          <tr><td style="height:9px;background:#f6cf73"></td></tr>
          <tr><td style="padding:24px 32px;background:#fbfaf4;border-bottom:1px solid #e7ecef">
            <img src="${DEFAULT_PORTAL_URL}/bright-learners-logo.png" width="210" alt="Bright Learners Academy" style="display:block;width:210px;max-width:70%;height:auto;border:0">
          </td></tr>
          <tr><td style="padding:34px 32px 32px">
            <div style="font-size:12px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#68827f">Staff Portal Notification</div>
            <h1 style="margin:12px 0 18px;font-family:Sniglet,'Trebuchet MS',Arial,sans-serif;font-weight:400;font-size:32px;line-height:1.18;color:#17345b">${escapeHtml(heading)}</h1>
            <div style="font-size:16px;line-height:1.7;color:#53657c">${body}</div>
            ${buttonLabel ? `<p style="margin:28px 0 4px"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#17345b;color:#fff;text-decoration:none;font-family:Mulish,Arial,sans-serif;font-weight:800;box-shadow:3px 4px 0 #f6cf73">${escapeHtml(buttonLabel)} &nbsp;→</a></p>` : ""}
          </td></tr>
          <tr><td style="padding:20px 32px;background:#eef6f2;color:#6b7d83;font-family:'Didact Gothic',Arial,sans-serif;font-size:13px;line-height:1.55">${escapeHtml(footer || "This automated message was generated by the Bright Learners Academy staff portal.")}</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

async function sendEmail({ idempotencyKey, type, to, cc = [], subject, html, metadata = {}, attachments = [] }) {
  const logRef = db.collection("notificationDeliveries").doc(idempotencyKey);
  const existing = await logRef.get();
  if (existing.exists && existing.data().status === "sent") return existing.data();

  await logRef.set({
    type,
    to,
    cc,
    subject,
    metadata,
    status: "sending",
    attemptedAt: FieldValue.serverTimestamp(),
    createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
  }, { merge: true });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey.value()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        cc,
        reply_to: ADMIN_EMAIL,
        subject,
        html,
        attachments,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.message || `Resend returned ${response.status}`);
    await logRef.set({
      status: "sent",
      provider: "resend",
      providerMessageId: result.id,
      sentAt: FieldValue.serverTimestamp(),
      lastError: FieldValue.delete(),
    }, { merge: true });
    return { status: "sent", providerMessageId: result.id };
  } catch (error) {
    await logRef.set({
      status: "failed",
      failedAt: FieldValue.serverTimestamp(),
      lastError: String(error?.message || error),
    }, { merge: true });
    throw error;
  }
}

async function locationDirectorEmail(location) {
  const id = String(location || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const snapshot = await db.collection("academyLocations").doc(id).get();
  return snapshot.exists && snapshot.data().directorEmail
    ? String(snapshot.data().directorEmail).trim()
    : directorEmails[location];
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function certificatePdf(data, certificateId) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([792, 612]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 0, width: 792, height: 612, color: rgb(0.976, 0.953, 0.89) });
  page.drawRectangle({ x: 34, y: 30, width: 724, height: 552, color: rgb(1, 0.992, 0.972), borderColor: rgb(0.09, 0.2, 0.37), borderWidth: 3 });
  page.drawRectangle({ x: 45, y: 41, width: 702, height: 530, borderColor: rgb(0.96, 0.82, 0.45), borderWidth: 7 });
  const centre = (text, y, size, font = regular, color = rgb(0.09, 0.2, 0.37)) => {
    page.drawText(text, { x: (792 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  };
  centre("BRIGHT LEARNERS ACADEMY", 518, 19, bold);
  centre("CERTIFICATE OF COMPLETION", 466, 15, bold);
  centre("This certifies that", 421, 14);
  centre(data.employeeName || "Employee", 361, 34, bold);
  centre("has successfully completed the Bright Learners Academy", 317, 13);
  centre(data.courseTitle || "Employee Orientation Program", 280, 21, bold);
  centre(`${data.location} · ${data.province === "SK" ? "Saskatchewan" : "Alberta"}`, 246, 12);
  centre(`Completed ${dateLabel(data.issuedAt)}`, 218, 11);
  centre(`Valid until ${dateLabel(data.expiresAt)}`, 197, 11);
  page.drawCircle({ x: 665, y: 124, size: 44, color: rgb(0.09, 0.2, 0.37), borderColor: rgb(0.96, 0.82, 0.45), borderWidth: 4 });
  centre("Internal employee orientation record", 76, 9);
  centre(`Certificate ID: ${certificateId}`, 59, 8);
  return Buffer.from(await pdf.save()).toString("base64");
}

async function inspectionPdf(data, inspectionId) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 742;
  const margin = 42;
  const addPage = () => { page = pdf.addPage([612, 792]); y = 750; };
  const write = (text, size = 9, font = regular, color = rgb(0.18, 0.25, 0.34), gap = 4) => {
    const lines = wrapText(text, font, size, 528);
    if (y - lines.length * (size + 3) < 42) addPage();
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size + 3;
    }
    y -= gap;
  };
  write("BRIGHT LEARNERS ACADEMY", 12, bold, rgb(0.09, 0.2, 0.37), 8);
  write("Monthly Facility Inspection Report", 21, bold, rgb(0.09, 0.2, 0.37), 10);
  write(`Location: ${data.location}`, 11, bold);
  write(`Completed by: ${data.directorName}`, 10);
  write(`Completed: ${dateLabel(data.completedAt)}`, 10);
  write(`Inspection ID: ${inspectionId}`, 8);
  y -= 8;
  const itemText = new Map((data.sections || []).flatMap((section) => (section.items || []).map((item) => [item.id, item.text])));
  for (const [itemId, response] of Object.entries(data.responses || {})) {
    const result = response?.result === "na" ? "N/A" : String(response?.result || "unanswered").toUpperCase();
    write(`${itemId}  [${result}]  ${itemText.get(itemId) || ""}`, 10, bold, response?.result === "fail" ? rgb(0.63, 0.18, 0.15) : rgb(0.09, 0.2, 0.37), 2);
    if (response?.note) write(`Explanation: ${response.note}`);
    if (response?.correctiveAction) write(`Corrective action: ${response.correctiveAction}`);
    if (response?.responsiblePerson || response?.dueDate) write(`Responsible: ${response.responsiblePerson || "Not assigned"}${response.dueDate ? ` · Due ${response.dueDate}` : ""}`);
    if (response?.photoUrl) {
      try {
        const imageResponse = await fetch(response.photoUrl);
        const bytes = new Uint8Array(await imageResponse.arrayBuffer());
        const contentType = imageResponse.headers.get("content-type") || "";
        const image = contentType.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const scaled = image.scale(Math.min(240 / image.width, 150 / image.height, 1));
        if (y - scaled.height < 42) addPage();
        page.drawImage(image, { x: margin, y: y - scaled.height, width: scaled.width, height: scaled.height });
        y -= scaled.height + 10;
      } catch {
        write("Photo evidence is retained in the secure portal record.", 8);
      }
    }
    y -= 5;
  }
  if (data.overallNotes) write(`Overall notes: ${data.overallNotes}`, 10, bold);
  return Buffer.from(await pdf.save()).toString("base64");
}

exports.sendQueuedNotification = onDocumentCreated({
  document: "notificationQueue/{notificationId}",
  region: "us-east4",
  secrets: [resendApiKey],
  retry: true,
}, async (event) => {
  const data = event.data?.data();
  if (!data || data.status === "sent") return;
  const notificationId = event.params.notificationId;
  if (data.type !== "staff-signup") return;
  if (String(data.staffEmail || "").toLowerCase() === STANDALONE_OWNER_EMAIL) {
    await event.data.ref.set({ status: "skipped-owner", attemptedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }

  const html = emailShell({
    preheader: `${data.staffName} created a Bright Learners staff account.`,
    heading: "New staff account created",
    body: `<p><strong>${escapeHtml(data.staffName)}</strong> created a staff profile.</p>
      <p><strong>Email:</strong> ${escapeHtml(data.staffEmail)}<br>
      <strong>Location:</strong> ${escapeHtml(data.location)}<br>
      <strong>Role:</strong> ${escapeHtml(data.role)}<br>
      <strong>Province:</strong> ${escapeHtml(data.province)}</p>`,
    buttonLabel: "Review staff account",
    buttonUrl: portalLink("/?portal=admin&view=staff"),
  });
  const result = await sendEmail({
    idempotencyKey: `queue-${notificationId}`,
    type: "staff-signup",
    to: await locationDirectorEmail(data.location),
    subject: `New staff account: ${data.staffName} — ${data.location}`,
    html,
    metadata: { actorId: data.actorId, location: data.location },
  });
  await event.data.ref.set({
    status: result.status,
    providerMessageId: result.providerMessageId || null,
    attemptedAt: FieldValue.serverTimestamp(),
    sentAt: result.status === "sent" ? FieldValue.serverTimestamp() : null,
  }, { merge: true });
});

exports.sendCertificateCompletion = onDocumentCreated({
  document: "certificates/{certificateId}",
  region: "us-east4",
  secrets: [resendApiKey],
  retry: true,
}, async (event) => {
  const data = event.data?.data();
  if (!data) return;
  if (await isStandaloneOwner(data.userId)) {
    await event.data.ref.set({ notificationStatus: "skipped-owner", notificationSentAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  const checklist = Array.isArray(data.moduleChecklist)
    ? `<ol>${data.moduleChecklist.map((item) => `<li>${escapeHtml(item.title)} — Passed</li>`).join("")}</ol>`
    : "";
  const html = emailShell({
    preheader: `${data.employeeName} completed Bright Learners orientation.`,
    heading: "Employee orientation completed",
    body: `<p><strong>${escapeHtml(data.employeeName)}</strong> completed all required orientation modules with the required 100% score.</p>
      <p><strong>Location:</strong> ${escapeHtml(data.location)}<br>
      <strong>Province:</strong> ${escapeHtml(data.province)}<br>
      <strong>Completed:</strong> ${escapeHtml(dateLabel(data.issuedAt))}<br>
      <strong>Renewal due:</strong> ${escapeHtml(dateLabel(data.expiresAt))}</p>${checklist}
      <p>The signed certificate is stored in the Administration Console under Certificates.</p>`,
    buttonLabel: "View certificate",
    buttonUrl: portalLink(),
  });
  const result = await sendEmail({
    idempotencyKey: `certificate-${event.params.certificateId}`,
    type: "orientation-completed",
    to: ADMIN_EMAIL,
    subject: `Orientation completed: ${data.employeeName} — ${data.location}`,
    html,
    metadata: { certificateId: event.params.certificateId, userId: data.userId, location: data.location },
    attachments: [{
      filename: `${data.employeeName || "Employee"}_${data.location}_Bright_Learners_Certificate.pdf`.replace(/[^a-z0-9_.-]+/gi, "_"),
      content: await certificatePdf(data, event.params.certificateId),
    }],
  });
  await event.data.ref.set({
    notificationStatus: result.status,
    providerMessageId: result.providerMessageId || null,
    notificationSentAt: FieldValue.serverTimestamp(),
  }, { merge: true });
});

exports.sendInspectionCompletion = onDocumentUpdated({
  document: "inspections/{inspectionId}",
  region: "us-east4",
  secrets: [resendApiKey],
  retry: true,
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || before?.status === "completed" || after.status !== "completed") return;
  if (await isStandaloneOwner(after.directorId || after.userId)) {
    await event.data.after.ref.set({ notificationStatus: "skipped-owner", notificationSentAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  const responses = Object.values(after.responses || {});
  const failed = responses.filter((item) => item?.result === "fail").length;
  const notApplicable = responses.filter((item) => item?.result === "na").length;
  const html = emailShell({
    preheader: `${after.directorName} submitted the ${after.location} monthly inspection.`,
    heading: "Monthly inspection submitted",
    body: `<p><strong>${escapeHtml(after.directorName)}</strong> completed the monthly facility inspection.</p>
      <p><strong>Location:</strong> ${escapeHtml(after.location)}<br>
      <strong>Completed:</strong> ${escapeHtml(dateLabel(after.completedAt))}<br>
      <strong>Checklist responses:</strong> ${escapeHtml(after.answeredCount || responses.length)}<br>
      <strong>Failed items:</strong> ${failed}<br>
      <strong>N/A items:</strong> ${notApplicable}</p>
      <p>The complete PDF report is attached. It is also available in the portal with explanations, corrective actions and photographs.</p>`,
    buttonLabel: "View inspection report",
    buttonUrl: portalLink(),
  });
  const result = await sendEmail({
    idempotencyKey: `inspection-${event.params.inspectionId}`,
    type: "inspection-completed",
    to: await locationDirectorEmail(after.location),
    subject: `Inspection submitted: ${after.location} — ${after.directorName}`,
    html,
    metadata: { inspectionId: event.params.inspectionId, location: after.location, directorId: after.directorId },
    attachments: [{
      filename: `${after.directorName || "Director"}_${after.location}_Inspection_${dateOnly(after.completedAt?.toDate?.() || new Date())}.pdf`.replace(/[^a-z0-9_.-]+/gi, "_"),
      content: await inspectionPdf(after, event.params.inspectionId),
    }],
  });
  await event.data.after.ref.set({
    notificationStatus: result.status,
    providerMessageId: result.providerMessageId || null,
    notificationSentAt: FieldValue.serverTimestamp(),
  }, { merge: true });
});

async function loadSchedule() {
  const snapshot = await db.collection("complianceSchedules").doc("default").get();
  return {
    inspectionDueDay: 15,
    renewalReminderDays: 30,
    ...(snapshot.exists ? snapshot.data() : {}),
  };
}

function monthlyDueDate(now, dueDay) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(28, Math.max(1, dueDay)), 18));
}

async function inspectionCompletedForMonth(location, due) {
  const [snapshot, ownerIds] = await Promise.all([
    db.collection("inspections").where("location", "==", location).get(),
    standaloneOwnerIds(),
  ]);
  return snapshot.docs.some((item) => {
    const data = item.data();
    const completed = data.completedAt?.toDate?.();
    return data.status === "completed"
      && !ownerIds.has(data.directorId || data.userId)
      && completed
      && completed.getUTCFullYear() === due.getUTCFullYear()
      && completed.getUTCMonth() === due.getUTCMonth();
  });
}

async function sendInspectionReminders(now, schedule) {
  const due = monthlyDueDate(now, schedule.inspectionDueDay);
  const days = dayDifference(now, due);
  if (![7, 3, 0].includes(days) && days >= 0) return;

  await Promise.all(academyNames.map(async (location) => {
    if (await inspectionCompletedForMonth(location, due)) return;
    const directorEmail = await locationDirectorEmail(location);
    if (!directorEmail) return;
    const overdueDays = Math.max(0, -days);
    const type = days === 7 ? "inspection-reminder-7" : days === 3 ? "inspection-reminder-3" : days === 0 ? "inspection-due" : "inspection-overdue";
    const timing = days > 0 ? `due in ${days} days` : days === 0 ? "due today" : `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
    const html = emailShell({
      preheader: `${location}'s monthly inspection is ${timing}.`,
      heading: days < 0 ? "Monthly inspection is overdue" : "Monthly inspection reminder",
      body: `<p>The <strong>${escapeHtml(location)}</strong> monthly facility inspection is <strong>${escapeHtml(timing)}</strong>.</p>
        <p><strong>Due date:</strong> ${escapeHtml(dateLabel(due))}</p>
        <p>Open the Director Inspection portal to start or resume the checklist.</p>`,
      buttonLabel: "Open inspection portal",
      buttonUrl: portalLink(),
    });
    await sendEmail({
      idempotencyKey: `${type}-${dateOnly(due)}-${location.toLowerCase().replaceAll(" ", "-")}`,
      type,
      to: directorEmail,
      subject: `${days < 0 ? "Overdue" : "Reminder"}: ${location} monthly inspection ${timing}`,
      html,
      metadata: { location, dueDate: dateOnly(due), daysFromDue: days },
    });
  }));
}

async function sendCourseOverdueDigest(now) {
  const [progressSnapshot, usersSnapshot] = await Promise.all([
    db.collection("progress").where("dueAt", "<", Timestamp.fromDate(now)).get(),
    db.collection("users").where("status", "==", "active").get(),
  ]);
  const users = new Map(usersSnapshot.docs.map((item) => [item.id, item.data()]));
  const overdue = progressSnapshot.docs.flatMap((item) => {
    const data = item.data();
    if ((data.completedModules || []).length >= 8) return [];
    const user = users.get(data.userId);
    if (!user || String(user.email || "").toLowerCase() === STANDALONE_OWNER_EMAIL) return [];
    const due = data.dueAt?.toDate?.();
    return [{
      name: user.displayName || user.email,
      location: user.location,
      due,
      days: due ? Math.max(1, -dayDifference(now, due)) : 0,
    }];
  });
  if (!overdue.length) return;
  const rows = overdue
    .sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name))
    .map((item) => `<tr><td style="padding:8px;border-bottom:1px solid #e4e9ed">${escapeHtml(item.name)}</td><td style="padding:8px;border-bottom:1px solid #e4e9ed">${escapeHtml(item.location)}</td><td style="padding:8px;border-bottom:1px solid #e4e9ed">${escapeHtml(dateLabel(item.due))}</td><td style="padding:8px;border-bottom:1px solid #e4e9ed">${item.days}</td></tr>`)
    .join("");
  const html = emailShell({
    preheader: `${overdue.length} employee orientation assignment(s) are overdue.`,
    heading: "Overdue employee orientation digest",
    body: `<p>${overdue.length} active employee orientation assignment${overdue.length === 1 ? " is" : "s are"} overdue.</p>
      <table width="100%" cellspacing="0" cellpadding="0"><thead><tr><th align="left">Employee</th><th align="left">Location</th><th align="left">Due</th><th align="left">Days</th></tr></thead><tbody>${rows}</tbody></table>`,
    buttonLabel: "Review staff progress",
    buttonUrl: portalLink(),
  });
  await sendEmail({
    idempotencyKey: `course-overdue-digest-${dateOnly(now)}`,
    type: "course-overdue-digest",
    to: ADMIN_EMAIL,
    subject: `Overdue orientation digest — ${overdue.length} assignment${overdue.length === 1 ? "" : "s"}`,
    html,
    metadata: { count: overdue.length, reportDate: dateOnly(now) },
  });
}

async function sendRenewalDigest(now, reminderDays) {
  const cutoff = Timestamp.fromDate(addDays(now, reminderDays));
  const [snapshot, ownerIds] = await Promise.all([
    db.collection("certificates").where("expiresAt", "<=", cutoff).get(),
    standaloneOwnerIds(),
  ]);
  const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.expiresAt?.toDate?.() && !ownerIds.has(item.userId));
  if (!records.length) return;
  const rows = records.map((item) => {
    const expiry = item.expiresAt.toDate();
    const days = dayDifference(now, expiry);
    return `<tr><td style="padding:8px;border-bottom:1px solid #e4e9ed">${escapeHtml(item.employeeName)}</td><td style="padding:8px;border-bottom:1px solid #e4e9ed">${escapeHtml(item.location)}</td><td style="padding:8px;border-bottom:1px solid #e4e9ed">${escapeHtml(dateLabel(expiry))}</td><td style="padding:8px;border-bottom:1px solid #e4e9ed">${days < 0 ? `${Math.abs(days)} overdue` : `${days} remaining`}</td></tr>`;
  }).join("");
  const html = emailShell({
    preheader: `${records.length} certificate renewal(s) need attention.`,
    heading: "Certificate renewal digest",
    body: `<p>The following Bright Learners orientation certificates are expired or approaching renewal.</p>
      <table width="100%" cellspacing="0" cellpadding="0"><thead><tr><th align="left">Employee</th><th align="left">Location</th><th align="left">Expiry</th><th align="left">Status</th></tr></thead><tbody>${rows}</tbody></table>`,
    buttonLabel: "Open certificate library",
    buttonUrl: portalLink(),
  });
  await sendEmail({
    idempotencyKey: `renewal-digest-${dateOnly(now)}`,
    type: "certificate-renewal-digest",
    to: ADMIN_EMAIL,
    subject: `Certificate renewal digest — ${records.length} record${records.length === 1 ? "" : "s"}`,
    html,
    metadata: { count: records.length, reportDate: dateOnly(now) },
  });
}

exports.runDailyComplianceEmails = onSchedule({
  schedule: "0 8 * * *",
  timeZone: "America/Regina",
  region: "us-east4",
  secrets: [resendApiKey],
  retryCount: 2,
}, async () => {
  const now = new Date();
  const schedule = await loadSchedule();
  const tasks = [
    sendInspectionReminders(now, schedule),
    sendRenewalDigest(now, schedule.renewalReminderDays),
  ];
  const results = await Promise.allSettled(tasks);
  results.forEach((result, index) => {
    if (result.status === "rejected") logger.error("Scheduled email task failed", { index, error: result.reason });
  });
});
