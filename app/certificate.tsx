"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { jsPDF } from "jspdf";
import { db } from "./firebase";

export type CertificateRecord = {
  id: string;
  userId: string;
  employeeName: string;
  email: string;
  location: string;
  province: "AB" | "SK";
  courseId: string;
  courseTitle: string;
  moduleChecklist: Array<{ title: string; passed: boolean }>;
  issuedAt?: { toDate?: () => Date } | Date;
  expiresAt?: { toDate?: () => Date } | Date;
  sample?: boolean;
};

function valueDate(value?: { toDate?: () => Date } | Date) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return value.toDate?.() || null;
}

export function certificateDate(value?: { toDate?: () => Date } | Date) {
  const date = valueDate(value);
  return date ? new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(date) : "Pending";
}

export function certificateStatus(certificate: CertificateRecord) {
  const expiry = valueDate(certificate.expiresAt);
  if (!expiry) return "Active";
  const days = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  if (days < 0) return "Expired";
  if (days <= 60) return "Renewal due soon";
  return "Active";
}

async function imageData(url: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function downloadCertificatePdf(certificate: CertificateRecord) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  try {
    const background = await imageData("/doodle-background.png");
    pdf.addImage(background, "PNG", 0, 0, width, height, undefined, "FAST");
  } catch {
    pdf.setFillColor(249, 243, 228);
    pdf.rect(0, 0, width, height, "F");
  }
  pdf.setFillColor(255, 253, 248);
  pdf.roundedRect(34, 30, width - 68, height - 60, 16, 16, "F");
  pdf.setDrawColor(23, 52, 94);
  pdf.setLineWidth(3);
  pdf.roundedRect(44, 40, width - 88, height - 80, 12, 12, "S");
  pdf.setDrawColor(246, 211, 131);
  pdf.setLineWidth(8);
  pdf.roundedRect(52, 48, width - 104, height - 96, 8, 8, "S");
  try {
    const logo = await imageData("/bright-learners-logo.png");
    pdf.addImage(logo, "PNG", 70, 66, 150, 74, undefined, "FAST");
  } catch {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Bright Learners Academy", 72, 96);
  }
  pdf.setTextColor(23, 52, 94);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(certificate.sample ? "PREVIEW CERTIFICATE" : "CERTIFICATE OF COMPLETION", width / 2, 112, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(15);
  pdf.text("This certifies that", width / 2, 164, { align: "center" });
  pdf.setFont("helvetica", "bolditalic");
  pdf.setFontSize(34);
  pdf.text(certificate.employeeName, width / 2, 213, { align: "center" });
  pdf.setDrawColor(246, 211, 131);
  pdf.setLineWidth(2);
  pdf.line(width / 2 - 180, 223, width / 2 + 180, 223);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  pdf.text("has successfully completed the Bright Learners Academy", width / 2, 258, { align: "center" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(certificate.courseTitle, width / 2, 291, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(`${certificate.location} · ${certificate.province === "AB" ? "Alberta" : "Saskatchewan"}`, width / 2, 320, { align: "center" });
  pdf.text(`Completed ${certificateDate(certificate.issuedAt)}`, width / 2, 344, { align: "center" });
  pdf.text(`Valid until ${certificateDate(certificate.expiresAt)}`, width / 2, 366, { align: "center" });
  pdf.setFillColor(23, 52, 94);
  pdf.circle(width - 128, height - 126, 48, "F");
  pdf.setDrawColor(246, 211, 131);
  pdf.setLineWidth(4);
  pdf.circle(width - 128, height - 126, 39, "S");
  pdf.setTextColor(255, 253, 248);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("BRIGHT LEARNERS", width - 128, height - 134, { align: "center" });
  pdf.setFontSize(16);
  pdf.text("VERIFIED", width - 128, height - 116, { align: "center" });
  pdf.setTextColor(23, 52, 94);
  pdf.setFontSize(9);
  pdf.text("Internal employee orientation record", 72, height - 72);
  pdf.text(`Certificate ID: ${certificate.id}`, 72, height - 57);
  const safeName = `${certificate.employeeName}_${certificate.location}_Bright_Learners_Certificate`.replace(/[^a-z0-9_-]+/gi, "_");
  pdf.save(`${safeName}.pdf`);
}

export function CertificateViewer({ certificate, close }: { certificate: CertificateRecord; close: () => void }) {
  const [downloading, setDownloading] = useState(false);
  return <div className="certificate-backdrop">
    <section className="certificate-sheet" role="dialog" aria-modal="true" aria-labelledby="certificate-view-title">
      <button className="certificate-close" onClick={close} aria-label="Close certificate">×</button>
      <div className="certificate-paper">
        <Image src="/bright-learners-logo.png" alt="Bright Learners Academy" width={190} height={92} />
        <p className="eyebrow">{certificate.sample ? "Preview certificate" : "Certificate of completion"}</p>
        <span>This certifies that</span>
        <h1 id="certificate-view-title">{certificate.employeeName}</h1>
        <p>has successfully completed the Bright Learners Academy</p>
        <h2>{certificate.courseTitle}</h2>
        <p>{certificate.location} · {certificate.province === "AB" ? "Alberta" : "Saskatchewan"}</p>
        <div className="certificate-dates"><span><small>Completed</small><b>{certificateDate(certificate.issuedAt)}</b></span><span><small>Valid until</small><b>{certificateDate(certificate.expiresAt)}</b></span></div>
        <div className="academy-stamp"><small>Bright Learners</small><b>Verified</b></div>
        <footer>Internal employee orientation record · Certificate ID {certificate.id}</footer>
      </div>
      <button className="primary-button certificate-download" disabled={downloading} onClick={async () => { setDownloading(true); try { await downloadCertificatePdf(certificate); } finally { setDownloading(false); } }}>{downloading ? "Creating certificate..." : "Download certificate PDF"}</button>
    </section>
  </div>;
}

export default function CertificateStatus({ profile, close }: { profile: { uid: string; email: string; displayName: string; location: string; province: "AB" | "SK" }; close: () => void }) {
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CertificateRecord | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (profile.email.toLowerCase() === "pekaric.arian@gmail.com") {
        const issuedAt = new Date("2026-07-28T12:00:00-06:00");
        const expiresAt = new Date("2027-07-28T12:00:00-06:00");
        await setDoc(doc(db, "certificates", `${profile.uid}_owner-preview`), {
          id: `${profile.uid}_owner-preview`,
          userId: profile.uid,
          employeeName: profile.displayName,
          email: profile.email,
          location: profile.location,
          province: profile.province,
          courseId: `${profile.province.toLowerCase()}-orientation`,
          courseTitle: "Employee Orientation & Child Care Safety",
          moduleChecklist: [],
          issuedAt,
          expiresAt,
          sample: true,
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
      const snapshot = await getDocs(query(collection(db, "certificates"), where("userId", "==", profile.uid)));
      if (active) setCertificates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as CertificateRecord)));
      if (active) setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [profile]);

  if (selected) return <CertificateViewer certificate={selected} close={() => setSelected(null)} />;
  return <div className="profile-editor-backdrop"><section className="profile-editor certificate-status certificate-list-dialog" role="dialog" aria-modal="true" aria-labelledby="certificate-title">
    <button className="profile-editor-close" onClick={close} aria-label="Close certificate status">×</button>
    <span className="certificate-seal">☆</span><h2 id="certificate-title">Bright Learners Academy</h2>
    {loading ? <p>Loading certificates...</p> : certificates.length ? <div className="personal-certificate-list">{certificates.map((certificate) => <button key={certificate.id} onClick={() => setSelected(certificate)}><div><b>{certificate.sample ? "Certificate preview" : certificate.courseTitle}</b><small>{certificate.location} · Completed {certificateDate(certificate.issuedAt)}</small></div><span>{certificateStatus(certificate)}</span></button>)}</div> : <><p>Your final completion certificate will be generated for <b>{profile.displayName}</b> after every assigned module and assessment is completed at 100%.</p><div className="certificate-progress"><span>Requirement</span><b>Complete all 8 assigned modules</b></div><button className="brand-button" disabled>Certificate not yet available</button></>}
    <small>Certificates remain available here and in the administrator’s certificate library.</small>
  </section></div>;
}
