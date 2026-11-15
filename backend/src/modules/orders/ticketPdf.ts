// ==========================================
// FILE: backend/src/modules/orders/ticketPdf.ts
// PURPOSE: Draws tickets as a PDF: one page per ticket with the event details, the seat and the QR code.
// ==========================================
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export interface TicketPdfData {
  ticketId: string;
  code: string; // the secret inside the QR code. It is drawn as a QR code and never printed as text
  eventTitle: string;
  ticketName: string;
  startsAt: Date;
  endsAt: Date;
  venue: string;
  city: string;
  seat: string | null; // for example "Floor, Row A, Seat 3"
  holderName: string;
  orderReference: string;
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const COLOR = { ink: "#0b0b0d", gold: "#c9a45c", goldDark: "#8a6d2b", text: "#16161a", muted: "#6b6b73", line: "#d9d9de" };

// The built-in PDF fonts only know Western European text. Anything else would print as garbage, so it becomes "?".
const safe = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, "?");

// Same as safe(), but keeps the line breaks.
const safeLines = (text: string) => text.split("\n").map(safe).join("\n");

// Events have no time zone yet, so every time is shown in Nairobi time.
const TIME_ZONE = "Africa/Nairobi";
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });

function whenText(startsAt: Date, endsAt: Date): string {
  const startDay = dayFormat.format(startsAt);
  const endDay = dayFormat.format(endsAt);
  const times = `${timeFormat.format(startsAt)} to ${timeFormat.format(endsAt)}`;
  return startDay === endDay ? `${startDay}\n${times} (Nairobi time)` : `${startDay}, ${timeFormat.format(startsAt)}\nuntil ${endDay}, ${timeFormat.format(endsAt)} (Nairobi time)`;
}

export const ticketFileName = (eventTitle: string, ticketId: string) => {
  const base = eventTitle
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `ticket-${base || "event"}-${ticketId.slice(-6).toUpperCase()}.pdf`;
};

function drawTicket(doc: PDFKit.PDFDocument, ticket: TicketPdfData, qr: Buffer) {
  // ---- header band ----
  doc.rect(0, 0, PAGE.width, 92).fill(COLOR.ink);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(COLOR.gold).text("TICKET TAKE IT", MARGIN, 38, { characterSpacing: 2 });
  doc.font("Helvetica").fontSize(10).fillColor("#bdbdc4").text("E-TICKET", MARGIN, 40, { width: CONTENT_WIDTH, align: "right", characterSpacing: 2 });

  // ---- event ----
  let y = 126;
  doc.font("Helvetica-Bold").fontSize(26).fillColor(COLOR.text);
  const title = safe(ticket.eventTitle);
  doc.text(title, MARGIN, y, { width: CONTENT_WIDTH, height: 70, ellipsis: true });
  y += Math.min(doc.heightOfString(title, { width: CONTENT_WIDTH }), 70) + 10;

  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOR.goldDark).text(safe(ticket.ticketName), MARGIN, y, { width: CONTENT_WIDTH });
  y += 38;

  // ---- details ----
  const detail = (label: string, value: string, x: number, top: number, width: number) => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR.muted).text(label.toUpperCase(), x, top, { width, characterSpacing: 1.5 });
    doc.font("Helvetica").fontSize(12).fillColor(COLOR.text).text(value, x, top + 13, { width });
    return top + 13 + doc.heightOfString(value, { width }) + 16;
  };

  const half = (CONTENT_WIDTH - 24) / 2;
  const rightX = MARGIN + half + 24;

  const leftEnd = detail("When", safeLines(whenText(ticket.startsAt, ticket.endsAt)), MARGIN, y, half);
  const rightEnd = detail("Where", `${safe(ticket.venue)}\n${safe(ticket.city)}`, rightX, y, half);
  y = Math.max(leftEnd, rightEnd);

  const seatEnd = detail(ticket.seat ? "Seat" : "Entry", ticket.seat ? safe(ticket.seat) : "General admission", MARGIN, y, half);
  const holderEnd = detail("Ticket holder", safe(ticket.holderName), rightX, y, half);
  y = Math.max(seatEnd, holderEnd);

  const orderEnd = detail("Order", safe(ticket.orderReference), MARGIN, y, half);
  const idEnd = detail("Ticket number", ticket.ticketId.slice(-8).toUpperCase(), rightX, y, half);
  y = Math.max(orderEnd, idEnd) + 6;

  // ---- tear-off line ----
  const cutY = Math.max(y, 440);
  doc.save().dash(5, { space: 4 }).lineWidth(1).strokeColor(COLOR.line).moveTo(MARGIN, cutY).lineTo(PAGE.width - MARGIN, cutY).stroke().undash().restore();

  // ---- QR code ----
  const qrSize = 220;
  const qrX = (PAGE.width - qrSize) / 2;
  const qrY = cutY + 28;
  doc.roundedRect(qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 10).lineWidth(1).strokeColor(COLOR.line).stroke();
  doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });

  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.text).text("Scan this code at the entrance", MARGIN, qrY + qrSize + 26, { width: CONTENT_WIDTH, align: "center" });

  // ---- rules ----
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLOR.muted)
    .text(
      "This ticket admits one person and works once. Whoever scans the QR code first gets in, so keep it private and do not post photos of it. " +
        "If the ticket is transferred to someone else, this code stops working.",
      MARGIN + 20,
      PAGE.height - 64,
      { width: CONTENT_WIDTH - 40, align: "center", lineGap: 2 }
    );
}

// One PDF with one page per ticket.
export async function renderTicketsPdf(tickets: TicketPdfData[]): Promise<Buffer> {
  if (tickets.length === 0) throw new Error("There are no tickets to draw");

  const codes = await Promise.all(
    tickets.map((t) => QRCode.toBuffer(t.code, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 560 }))
  );

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: { Title: `Tickets for ${safe(tickets[0].eventTitle)}`, Author: "Ticket Take It" },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    tickets.forEach((ticket, index) => {
      if (index > 0) doc.addPage();
      drawTicket(doc, ticket, codes[index]);
    });

    doc.end();
  });
}
// ==========================================
// END OF FILE: backend/src/modules/orders/ticketPdf.ts
// ==========================================