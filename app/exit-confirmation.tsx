"use client";

type Props = {
  title: string;
  message: string;
  saving?: boolean;
  stay: () => void;
  saveAndExit: () => void | Promise<void>;
};

export default function ExitConfirmation({ title, message, saving = false, stay, saveAndExit }: Props) {
  return <div className="exit-confirmation-backdrop" role="presentation">
    <section className="exit-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="exit-confirmation-title" aria-describedby="exit-confirmation-message">
      <span className="exit-confirmation-icon" aria-hidden="true">✓</span>
      <p className="eyebrow">Your work is protected</p>
      <h2 id="exit-confirmation-title">{title}</h2>
      <p id="exit-confirmation-message">{message}</p>
      <div className="exit-confirmation-actions">
        <button className="outline-button" disabled={saving} onClick={stay}>Keep working</button>
        <button className="primary-button" disabled={saving} onClick={() => void saveAndExit()}>{saving ? "Saving..." : "Save progress & exit"}</button>
      </div>
    </section>
  </div>;
}
