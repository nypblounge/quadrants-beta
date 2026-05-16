import { defaultWsUrl } from "./quadrantsWsUiHelpers";

function normalizePath(path) {
  return String(path || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function makeRequestId() {
  return `store_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createQuadrantsWsStoreClient(url = defaultWsUrl()) {
  let ws = null;
  let connected = false;
  let connectPromise = null;
  let requestSeq = 1;

  const pending = new Map();
  const subscriptions = new Map();

  function send(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket store is not connected.");
    }

    ws.send(JSON.stringify(message));
  }

  function resolvePending(message) {
    const requestId = message.requestId;

    if (!requestId || !pending.has(requestId)) {
      return false;
    }

    const entry = pending.get(requestId);
    pending.delete(requestId);

    if (message.type === "error" || message.error) {
      entry.reject(new Error(message.error || "WebSocket store request failed."));
    } else {
      entry.resolve(message);
    }

    return true;
  }

  function handleMessage(message) {
    if (message.type === "welcome") {
      return;
    }

    if (resolvePending(message)) {
      return;
    }

    if (message.type === "store_value" && message.subscriptionId) {
      const subscription = subscriptions.get(message.subscriptionId);

      if (subscription) {
        subscription.callback({
          val: () => message.value,
          exists: () => message.value !== null && message.value !== undefined,
          key: subscription.path.split("/").filter(Boolean).at(-1) || null
        });
      }
    }
  }

  async function connect() {
    if (connected && ws && ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      ws = socket;

      const timeout = setTimeout(() => {
        reject(new Error("Timed out connecting to WebSocket store."));
      }, 8000);

      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        connected = true;
        resolve();
      });

      socket.addEventListener("message", (event) => {
        try {
          handleMessage(JSON.parse(event.data));
        } catch (err) {
          console.warn("Invalid WebSocket store message", err);
        }
      });

      socket.addEventListener("close", () => {
        connected = false;
        connectPromise = null;

        for (const entry of pending.values()) {
          entry.reject(new Error("WebSocket store connection closed."));
        }

        pending.clear();
      });

      socket.addEventListener("error", () => {
        if (!connected) {
          clearTimeout(timeout);
          connectPromise = null;
          reject(new Error("WebSocket store connection error."));
        }
      });
    });

    return connectPromise;
  }

  async function request(message) {
    await connect();

    const requestId = message.requestId || `${makeRequestId()}_${requestSeq++}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Timed out waiting for ${message.type}.`));
      }, 8000);

      pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      send({ ...message, requestId });
    });
  }

  return {
    async get(path) {
      const cleanPath = normalizePath(path);
      const response = await request({ type: "store_get", path: cleanPath });
      return {
        val: () => response.value,
        exists: () => response.value !== null && response.value !== undefined,
        key: cleanPath.split("/").filter(Boolean).at(-1) || null
      };
    },

    async set(path, value) {
      await request({ type: "store_set", path: normalizePath(path), value });
    },

    async update(path, updates) {
      await request({ type: "store_update", path: normalizePath(path), updates });
    },

    async remove(path) {
      await request({ type: "store_remove", path: normalizePath(path) });
    },

    onValue(path, callback) {
      const cleanPath = normalizePath(path);
      const subscriptionId = `sub_${makeRequestId()}_${subscriptions.size + 1}`;

      subscriptions.set(subscriptionId, {
        path: cleanPath,
        callback
      });

      connect()
        .then(() => {
          send({
            type: "store_subscribe",
            subscriptionId,
            path: cleanPath
          });
        })
        .catch((err) => {
          console.warn("WebSocket store subscription failed", err);
        });

      return () => {
        subscriptions.delete(subscriptionId);

        if (ws && ws.readyState === WebSocket.OPEN) {
          send({
            type: "store_unsubscribe",
            subscriptionId
          });
        }
      };
    },

    disconnect() {
      if (ws) {
        ws.close();
      }
    }
  };
}

export const quadrantsWsStoreClient = createQuadrantsWsStoreClient();