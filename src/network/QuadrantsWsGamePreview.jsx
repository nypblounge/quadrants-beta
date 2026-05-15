import React from "react";

export function QuadrantsWsGamePreview() {
  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <h1>Quadrants WebSocket Game Preview</h1>
          <p className="muted">
            Read-only experiment for rendering game UI from WebSocket lobby state.
          </p>
        </div>
      </div>

      <main className="panel-stack">
        <section className="card hero-card">
          <div>
            <h2>WebSocket game preview</h2>
            <p>
              This preview is intentionally separate from the normal Firebase game and the
              standalone WebSocket lobby mode.
            </p>
          </div>
          <div className="lobby-code">WS</div>
        </section>

        <section className="card">
          <h3>Status</h3>
          <p className="muted">
            Preview route is installed. Next step will connect this screen to WebSocket room state.
          </p>
        </section>
      </main>
    </div>
  );
}

export default QuadrantsWsGamePreview;