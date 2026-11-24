export default function MaintenanceScreen() {
  return (
    <main className="maintenance-page">
      <div className="maintenance-orb maintenance-orb--one" aria-hidden="true" />
      <div className="maintenance-orb maintenance-orb--two" aria-hidden="true" />

      <section className="maintenance-card" aria-labelledby="maintenance-title">
        <div className="maintenance-brand" aria-label="UGVoice Transcribe">
          <span className="brand-mark">UG</span>
          <span>UGVoice Transcribe</span>
        </div>

        <div className="maintenance-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <path d="M30.3 7.5a10.5 10.5 0 0 0-12.8 13.7L7.9 30.8a4.5 4.5 0 0 0 0 6.4l2.9 2.9a4.5 4.5 0 0 0 6.4 0l9.6-9.6A10.5 10.5 0 0 0 40.5 17l-6.2 6.2-5.5-1.5-1.5-5.5 6.2-6.2a10.5 10.5 0 0 0-3.2-2.5Z" />
          </svg>
        </div>

        <div className="maintenance-copy">
          <p className="maintenance-eyebrow">Scheduled maintenance</p>
          <h1 id="maintenance-title">We&apos;ll be back shortly.</h1>
          <p>
            UGVoice Transcribe is temporarily offline while we make improvements.
            Thank you for your patience.
          </p>
        </div>

        <div className="maintenance-status" role="status">
          <span className="maintenance-status-dot" aria-hidden="true" />
          <span>Service maintenance in progress</span>
        </div>

        <footer className="maintenance-footer">
          University of Ghana · DCS HCI Lab
        </footer>
      </section>
    </main>
  );
}
