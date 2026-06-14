// hub: app/api/billing/invoice/route.ts
//
// GET /api/billing/invoice?period=YYYY-MM
//   Church self-serve: generates their own invoice for a paid month.
//
// GET /api/billing/invoice?period=YYYY-MM&tenantId=xxx
//   Super admin override: generates an invoice for any church.
//
// Returns a printable HTML page. The user opens it in a new tab and
// uses their browser's Print -> Save as PDF to download.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getUid(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decoded.uid;
  } catch {
    return null;
  }
}

function monthLabel(period: string): string {
  const [year, month] = period.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function generateInvoiceHTML(data: {
  invoiceNumber: string;
  period: string;
  monthLabel: string;
  amount: number;
  paidAt: string;
  churchName: string;
  churchEmail: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${data.invoiceNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 40px 20px;
    }

    .invoice-wrap {
      max-width: 680px;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }

    .header {
      background: #1A5C38;
      padding: 36px 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .header-left h1 {
      color: #fff;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }

    .header-left p {
      color: #6ee7b7;
      font-size: 13px;
      margin-top: 4px;
    }

    .header-right {
      text-align: right;
    }

    .header-right .inv-number {
      color: #fff;
      font-size: 15px;
      font-weight: 700;
    }

    .header-right .inv-date {
      color: #a7f3d0;
      font-size: 12px;
      margin-top: 4px;
    }

    .paid-badge {
      display: inline-block;
      margin-top: 10px;
      background: #10b981;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 4px 12px;
      border-radius: 999px;
    }

    .body {
      padding: 36px 40px;
    }

    .parties {
      display: flex;
      gap: 40px;
      margin-bottom: 36px;
    }

    .party {
      flex: 1;
    }

    .party-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
      margin-bottom: 10px;
    }

    .party-name {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .party-detail {
      font-size: 13px;
      color: #64748b;
      line-height: 1.7;
    }

    .divider {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 0 0 28px;
    }

    .line-items table {
      width: 100%;
      border-collapse: collapse;
    }

    .line-items th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      padding: 0 0 12px;
      border-bottom: 1px solid #e2e8f0;
    }

    .line-items th:last-child,
    .line-items td:last-child {
      text-align: right;
    }

    .line-items td {
      padding: 16px 0;
      font-size: 14px;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
    }

    .line-items td.desc strong {
      display: block;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 2px;
    }

    .line-items td.desc span {
      font-size: 12px;
      color: #94a3b8;
    }

    .totals {
      margin-top: 24px;
      border-top: 2px solid #e2e8f0;
      padding-top: 20px;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .totals-row .label {
      font-size: 13px;
      color: #64748b;
    }

    .totals-row .value {
      font-size: 13px;
      color: #334155;
    }

    .totals-row.total .label {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }

    .totals-row.total .value {
      font-size: 20px;
      font-weight: 800;
      color: #1A5C38;
    }

    .footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 24px 40px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.7;
    }

    .footer a {
      color: #1A5C38;
      text-decoration: none;
    }

    .print-btn {
      display: block;
      width: fit-content;
      margin: 24px auto 0;
      background: #1A5C38;
      color: #fff;
      border: none;
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }

    @media print {
      body { background: #fff; padding: 0; }
      .invoice-wrap { box-shadow: none; border-radius: 0; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-wrap">
    <div class="header">
      <div class="header-left">
        <h1>INVOICE</h1>
        <p>KEREKEHUB (PTY) LTD</p>
      </div>
      <div class="header-right">
        <div class="inv-number">${data.invoiceNumber}</div>
        <div class="inv-date">Issued: ${formatDate(data.paidAt)}</div>
        <div class="paid-badge">PAID</div>
      </div>
    </div>

    <div class="body">
      <div class="parties">
        <div class="party">
          <div class="party-label">From</div>
          <div class="party-name">KEREKEHUB (PTY) LTD</div>
          <div class="party-detail">
            Reg. No. 2026/413234/07<br/>
            Tembisa, 1632<br/>
            Gauteng, South Africa<br/>
            +27 78 044 3373<br/>
            sifiso@kerekehub.co.za
          </div>
        </div>
        <div class="party">
          <div class="party-label">Billed To</div>
          <div class="party-name">${data.churchName}</div>
          <div class="party-detail">
            ${data.churchEmail}
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="line-items">
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Period</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="desc">
                <strong>Kereke Hub Platform Subscription</strong>
                <span>Monthly SaaS platform access</span>
              </td>
              <td>${data.monthLabel}</td>
              <td>R ${data.amount.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="totals">
        <div class="totals-row">
          <span class="label">Subtotal</span>
          <span class="value">R ${data.amount.toFixed(2)}</span>
        </div>
        <div class="totals-row">
          <span class="label">VAT (0% — Not VAT Registered)</span>
          <span class="value">R 0.00</span>
        </div>
        <div class="totals-row total">
          <span class="label">Total Paid</span>
          <span class="value">R ${data.amount.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <strong>KEREKEHUB (PTY) LTD</strong> &nbsp;|&nbsp; Reg. No. 2026/413234/07 &nbsp;|&nbsp;
      Tembisa, 1632, Gauteng, South Africa &nbsp;|&nbsp;
      <a href="mailto:sifiso@kerekehub.co.za">sifiso@kerekehub.co.za</a> &nbsp;|&nbsp;
      <a href="https://kerekehub.co.za">kerekehub.co.za</a><br/>
      This invoice is proof of payment for the period stated above. For queries, contact us at the details above.
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">Download / Print Invoice</button>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getUid();
    if (!uid) return new NextResponse("Unauthorized", { status: 401 });

    const period = req.nextUrl.searchParams.get("period");
    const targetTenantId = req.nextUrl.searchParams.get("tenantId");

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return new NextResponse("Invalid period. Use YYYY-MM format.", { status: 400 });
    }

    let tenantId = uid;

    // Super admin can generate for any tenant
    if (targetTenantId && targetTenantId !== uid) {
      const userDoc = await adminDb.collection("users").doc(uid).get();
      if (userDoc.data()?.role !== "super_admin") {
        return new NextResponse("Forbidden", { status: 403 });
      }
      tenantId = targetTenantId;
    }

    // Load tenant
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) return new NextResponse("Tenant not found", { status: 404 });

    const tenant = tenantSnap.data()!;

    // Try to load payment record for this period
    const paymentsSnap = await adminDb.collection("payments")
      .where("tenantId", "==", tenantId)
      .where("period", "==", period)
      .limit(1)
      .get();

    let amount: number;
    let invoiceNumber: string;
    let paidAt: string;

    if (!paymentsSnap.empty) {
      const p = paymentsSnap.docs[0].data();
      amount = p.amount;
      invoiceNumber = p.invoiceNumber;
      paidAt = p.paidAt;
    } else {
      // No payment record — use tenant's current rate (super admin use case)
      amount = tenant.lastPaymentAmount || tenant.currentRate || 159;
      invoiceNumber = `INV-${period.replace("-", "")}-${tenantId.slice(0, 6).toUpperCase()}`;
      const [year, month] = period.split("-");
      paidAt = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString();
    }

    const html = generateInvoiceHTML({
      invoiceNumber,
      period,
      monthLabel: monthLabel(period),
      amount,
      paidAt,
      churchName: tenant.name || "Unknown Church",
      churchEmail: tenant.ownerEmail || "",
    });

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[GET /api/billing/invoice] Error:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
