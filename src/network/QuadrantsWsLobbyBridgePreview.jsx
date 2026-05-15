import React from "react";

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function QuadrantsWsLobbyBridgePreview({ lobby, styles }) {
  if (!lobby) {
    return null;
  }

  return (
    <details style={styles.details} open>
      <summary>Quadrants lobby bridge preview</summary>
      <pre style={styles.pre}>{prettyJson(lobby)}</pre>
    </details>
  );
}

export default QuadrantsWsLobbyBridgePreview;