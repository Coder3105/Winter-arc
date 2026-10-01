export default function Loading() {
  return (
    <main className="system-boot" aria-labelledby="system-boot-title">
      <section className="system-boot__panel">
        <div className="system-boot__orbit" aria-hidden="true">
          <i />
          <i />
          <span />
        </div>
        <p className="system-boot__eyebrow">WINTER ARC // INITIALIZING</p>
        <h1 id="system-boot-title">SYSTEM LOADING</h1>
        <p className="system-boot__message" role="status">
          Establishing your connection to the System...
        </p>
        <div
          className="system-boot__track"
          role="progressbar"
          aria-label="Loading the System"
        >
          <span />
        </div>
        <div className="system-boot__footer" aria-hidden="true">
          <span>PLEASE WAIT</span>
          <span className="system-boot__signal">
            <i />
            <i />
            <i />
          </span>
        </div>
      </section>
    </main>
  );
}
