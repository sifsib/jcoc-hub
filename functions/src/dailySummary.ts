// ─────────────────────────────────────────────────────────────
// SCHEDULED: DAILY WHATSAPP SUMMARY
//
// Runs every 15 minutes. For each tenant that has enabled a daily
// summary, once their local summary time has arrived it computes the
// day's numbers and sends the church owner a short WhatsApp message:
//
//   New members added today
//   New first-time visitors captured today
//   Payments (income) received today, count + rand total
//   Visitor follow-ups that fall due tomorrow
//
// Every send (and every skip/failure) is written to summary_audit_logs
// so we can prove what went out and when, for POPIA.
//
// Opt-out at pilot stage is a dashboard toggle (summaryEnabled). The
// "Reply STOP SUMMARY" line is shown in the message but the inbound
// handling that flips the flag is not built yet (no inbound listener
// on the Baileys service). See HANDOVER.md.
// ─────────────────────────────────────────────────────────────
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp, FieldValue, Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  SummaryCounts,
  zonedNow,
  zonedDayStartUTC,
  addDaysStr,
  renderMessage,
  dateLabel,
  formatRand,
} from "./summaryFormat";

// The deployed Baileys WhatsApp service (kereke-whatsapp on Railway).
// URL is the base, e.g. https://kereke-whatsapp.up.railway.app
const WHATSAPP_SERVICE_URL = defineSecret("WHATSAPP_SERVICE_URL");
const WHATSAPP_SERVICE_KEY = defineSecret("WHATSAPP_SERVICE_KEY");

interface SummarySettings {
  summaryEnabled?: boolean;
  summaryTime?: string; // "HH:mm", 24h, in the tenant's own timezone
  timezone?: string; // IANA tz, e.g. "Africa/Johannesburg"
  recipientPhone?: string; // digits only, e.g. "27831234567"
  lastSentDate?: string; // "YYYY-MM-DD" in tenant tz, dedupe guard
}

type SendStatus = "sent" | "failed" | "skipped_no_phone" | "error";

// ── Data ────────────────────────────────────────────────────────

async function computeCounts(
  db: Firestore,
  tenantId: string,
  tz: string,
  todayStr: string
): Promise<SummaryCounts> {
  const start = Timestamp.fromDate(zonedDayStartUTC(tz, todayStr));
  const end = Timestamp.fromDate(zonedDayStartUTC(tz, addDaysStr(todayStr, 1)));
  const tomorrowStr = addDaysStr(todayStr, 1);

  // New members and visitors are dated by createdAt (a server Timestamp).
  const membersAgg = await db
    .collection("members")
    .where("tenantId", "==", tenantId)
    .where("createdAt", ">=", start)
    .where("createdAt", "<", end)
    .count()
    .get();

  const visitorsAgg = await db
    .collection("visitors")
    .where("tenantId", "==", tenantId)
    .where("createdAt", ">=", start)
    .where("createdAt", "<", end)
    .count()
    .get();

  // Payments: income transactions dated today. `date` is a "YYYY-MM-DD"
  // string, so we sum amounts in memory (equality-only query, no index).
  const txSnap = await db
    .collection("transactions")
    .where("tenantId", "==", tenantId)
    .where("type", "==", "income")
    .where("date", "==", todayStr)
    .get();
  let paymentTotal = 0;
  txSnap.forEach((doc) => {
    const amt = Number(doc.data().amount);
    if (!Number.isNaN(amt)) paymentTotal += amt;
  });

  // Follow-ups due tomorrow: pending workflow steps whose dueDate string
  // equals tomorrow.
  const followAgg = await db
    .collection("workflow_instance_steps")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "pending")
    .where("dueDate", "==", tomorrowStr)
    .count()
    .get();

  return {
    newMembers: membersAgg.data().count,
    newVisitors: visitorsAgg.data().count,
    paymentCount: txSnap.size,
    paymentTotal,
    followUps: followAgg.data().count,
  };
}

async function sendWhatsApp(
  baseUrl: string,
  serviceKey: string,
  tenantId: string,
  phone: string,
  summaryDate: string,
  counts: SummaryCounts
): Promise<{ messageId: string | null }> {
  // The summary now goes out as the approved `daily_summary` template rather
  // than free text. Two reasons this is not optional:
  //   - It is business-initiated, so outside the 24h window Meta only allows
  //     templates.
  //   - The old rendered message was multi-line, and template parameters
  //     cannot contain newlines. Each figure is therefore its own variable and
  //     the line breaks live in the approved template body.
  const url = `${baseUrl.replace(/\/+$/, "")}/message/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Key": serviceKey,
      "X-Tenant-Id": tenantId,
    },
    body: JSON.stringify({
      to: phone,
      templateKey: "daily_summary",
      extraValues: {
        summary_date: summaryDate,
        new_members: String(counts.newMembers),
        new_visitors: String(counts.newVisitors),
        payment_count: String(counts.paymentCount),
        payment_total: formatRand(counts.paymentTotal),
        follow_ups: String(counts.followUps),
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${text.slice(0, 200)}`);
  }
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return { messageId: typeof data.messageId === "string" ? data.messageId : null };
}

async function writeAudit(
  db: Firestore,
  fields: {
    tenantId: string;
    recipientPhone: string;
    message: string;
    counts: SummaryCounts;
    summaryDate: string;
    status: SendStatus;
    messageId?: string | null;
    error?: string | null;
  }
): Promise<void> {
  await db.collection("summary_audit_logs").add({
    ...fields,
    messageId: fields.messageId ?? null,
    error: fields.error ?? null,
    channel: "whatsapp",
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ── The scheduled function ──────────────────────────────────────

export const dailySummary = onSchedule(
  {
    schedule: "*/15 * * * *",
    timeZone: "Africa/Johannesburg",
    secrets: [WHATSAPP_SERVICE_URL, WHATSAPP_SERVICE_KEY],
  },
  async () => {
    const db = getFirestore();
    const baseUrl = WHATSAPP_SERVICE_URL.value();
    const serviceKey = WHATSAPP_SERVICE_KEY.value();

    const snap = await db
      .collection("summarySettings")
      .where("summaryEnabled", "==", true)
      .get();

    if (snap.empty) {
      logger.info("[dailySummary] No tenants with summaries enabled.");
      return;
    }

    for (const doc of snap.docs) {
      const tenantId = doc.id;
      const s = doc.data() as SummarySettings;
      const tz = s.timezone || "Africa/Johannesburg";
      const summaryTime = (s.summaryTime || "18:00").slice(0, 5);

      let hhmm: string;
      let dateStr: string;
      try {
        ({ hhmm, dateStr } = zonedNow(tz));
      } catch (e) {
        logger.error(`[dailySummary] Bad timezone "${tz}" for tenant ${tenantId}.`, e);
        continue;
      }

      // Not time yet today.
      if (hhmm < summaryTime) continue;
      // Already sent today (guard against the 15-min cadence resending).
      if (s.lastSentDate === dateStr) continue;

      let counts: SummaryCounts;
      try {
        counts = await computeCounts(db, tenantId, tz, dateStr);
      } catch (e) {
        logger.error(`[dailySummary] Compute failed for tenant ${tenantId}.`, e);
        continue; // leave lastSentDate untouched so it retries next run
      }

      const message = renderMessage(tz, dateStr, counts);

      // Mark as done for today BEFORE attempting the send. A daily summary
      // is not worth risking a double-send on: if the send fails we record
      // it in the audit log rather than retry and spam the owner.
      await doc.ref.set({ lastSentDate: dateStr }, { merge: true });

      const phone = (s.recipientPhone || "").replace(/\D/g, "");
      if (!phone) {
        await writeAudit(db, {
          tenantId,
          recipientPhone: "",
          message,
          counts,
          summaryDate: dateStr,
          status: "skipped_no_phone",
          error: "No recipientPhone set on summarySettings.",
        });
        continue;
      }

      if (!baseUrl || !serviceKey) {
        await writeAudit(db, {
          tenantId,
          recipientPhone: phone,
          message,
          counts,
          summaryDate: dateStr,
          status: "error",
          error: "WHATSAPP_SERVICE_URL / WHATSAPP_SERVICE_KEY not configured.",
        });
        continue;
      }

      try {
        const { messageId } = await sendWhatsApp(
          baseUrl,
          serviceKey,
          tenantId,
          phone,
          dateLabel(tz, dateStr),
          counts
        );
        await writeAudit(db, {
          tenantId,
          recipientPhone: phone,
          message,
          counts,
          summaryDate: dateStr,
          status: "sent",
          messageId,
        });
        logger.info(`[dailySummary] Sent to tenant ${tenantId} (${phone}).`);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await writeAudit(db, {
          tenantId,
          recipientPhone: phone,
          message,
          counts,
          summaryDate: dateStr,
          status: "failed",
          error,
        });
        logger.error(`[dailySummary] Send failed for tenant ${tenantId}.`, e);
      }
    }
  }
);
