"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { CertificateRecord, CertificateViewer, certificateDate, certificateStatus, downloadCertificatePdf } from "./certificate";

export default function CertificateLibrary() {
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState("All locations");
  const [selected, setSelected] = useState<CertificateRecord | null>(null);
  const [downloading, setDownloading] = useState("");

  useEffect(() => {
    let active = true;
    getDocs(collection(db, "certificates")).then((snapshot) => {
      if (!active) return;
      setCertificates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as CertificateRecord)).sort((a, b) => a.location.localeCompare(b.location) || a.employeeName.localeCompare(b.employeeName)));
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { active = false; };
  }, []);

  const locations = Array.from(new Set(certificates.map((certificate) => certificate.location))).sort();
  const visible = location === "All locations" ? certificates : certificates.filter((certificate) => certificate.location === location);
  const grouped = locations.filter((academy) => location === "All locations" || academy === location).map((academy) => ({
    academy,
    certificates: visible.filter((certificate) => certificate.location === academy),
  }));

  async function download(certificate: CertificateRecord) {
    setDownloading(certificate.id);
    try { await downloadCertificatePdf(certificate); } finally { setDownloading(""); }
  }

  return <div className="content admin-certificate-library">
    <div className="page-intro"><p className="eyebrow">Annual training records</p><h1>Certificates</h1><p>View and download employee orientation certificates, grouped by academy location.</p></div>
    <div className="certificate-admin-summary"><article><b>{certificates.length}</b><span>Total certificates</span></article><article><b>{certificates.filter((certificate) => certificateStatus(certificate) === "Renewal due soon").length}</b><span>Renewals due soon</span></article><article><b>{certificates.filter((certificate) => certificateStatus(certificate) === "Expired").length}</b><span>Expired</span></article></div>
    <label className="inspection-location-filter">Location<select value={location} onChange={(event) => setLocation(event.target.value)}><option>All locations</option>{locations.map((academy) => <option key={academy}>{academy}</option>)}</select></label>
    {loading ? <p className="inspection-record-message">Loading certificates...</p> : grouped.length === 0 ? <p className="inspection-record-message">No certificates have been issued yet.</p> : grouped.map((group) => <section className="certificate-location-group" key={group.academy}>
      <div className="section-heading"><div><p className="eyebrow">Academy location</p><h2>{group.academy}</h2></div><span>{group.certificates.length} certificate{group.certificates.length === 1 ? "" : "s"}</span></div>
      {group.certificates.map((certificate) => <article className="certificate-admin-row" key={certificate.id}>
        <span>{certificate.employeeName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
        <div><b>{certificate.employeeName}</b><small>{certificate.location} · {certificate.province} · Completed {certificateDate(certificate.issuedAt)}</small></div>
        <strong className={`renewal-${certificateStatus(certificate).toLowerCase().replaceAll(" ", "-")}`}>{certificateStatus(certificate)}<small>Expires {certificateDate(certificate.expiresAt)}</small></strong>
        <div><button className="outline-button" onClick={() => setSelected(certificate)}>View</button><button className="primary-button" disabled={downloading === certificate.id} onClick={() => void download(certificate)}>{downloading === certificate.id ? "Creating..." : "Download"}</button></div>
      </article>)}
    </section>)}
    {selected && <CertificateViewer certificate={selected} close={() => setSelected(null)} />}
  </div>;
}
