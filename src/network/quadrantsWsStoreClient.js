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
  let reconnectTimer = null;
  let reconnectDelayMs = 1000;
  let manuallyClosed = false;

  const pending = new Map();
  const subscriptions = new Map();

  function send(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket store is not connected.");
    }

    ws.send(JSON.stringify(message));
  }

  function subscribeOne(subscriptionId) {
    const subscription = subscriptions.get(subscriptionId);

    if (!subscription || subscription.subscribed || !ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    send({
      type: "store_subscribe",
      subscriptionId,
      path: subscription.path
    });

    subscription.subscribed = true;
  }

  function resubscribeAll() {
    for (const subscription of subscriptions.values()) {
      subscription.subscribed = false;
    }

    for (const subscriptionId of subscriptions.keys()) {
      subscribeOne(subscriptionId);
    }
  }

  function scheduleReconnect() {
    if (manuallyClosed || reconnectTimer || subscriptions.size === 0) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch((err) => {
        console.warn("WebSocket store reconnect failed", err);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 10000);
        scheduleReconnect();
      });
    }, reconnectDelayMs);
  }

  function isTransientStoreError(err) {
    const message = String(err?.message || err || "").toLowerCase();
    return message.includes("connection closed") || message.includes("not connected") || message.includes("connection error") || message.includes("timed out connecting");
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    manuallyClosed = false;

    if (connected && ws && ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (connectPromise) {
      return connectPromise;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      ws = socket;
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        connectPromise = null;
        reject(new Error("Timed out connecting to WebSocket store."));
        try {
          socket.close();
        } catch {
          // Ignore close failures during a failed connection attempt.
        }
      }, 8000);

      socket.addEventListener("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        connected = true;
        connectPromise = null;
        reconnectDelayMs = 1000;
        resubscribeAll();
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
        clearTimeout(timeout);
        connected = false;
        connectPromise = null;

        for (const subscription of subscriptions.values()) {
          subscription.subscribed = false;
        }

        for (const entry of pending.values()) {
          entry.reject(new Error("WebSocket store connection closed."));
        }

        pending.clear();
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        if (!connected && !settled) {
          settled = true;
          clearTimeout(timeout);
          connectPromise = null;
          reject(new Error("WebSocket store connection error."));
        }
      });
    });

    return connectPromise;
  }

  async function request(message, attempt = 0) {
    try {
      await connect();

      const requestId = message.requestId || `${makeRequestId()}_${requestSeq++}`;

      return await new Promise((resolve, reject) => {
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

        try {
          send({ ...message, requestId });
        } catch (err) {
          clearTimeout(timeout);
          pending.delete(requestId);
          reject(err);
        }
      });
    } catch (err) {
      if (!manuallyClosed && attempt < 2 && isTransientStoreError(err)) {
        await wait(Math.min(1000 * (attempt + 1), 2500));
        return request(message, attempt + 1);
      }

      throw err;
    }
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
        callback,
        subscribed: false
      });

      connect()
        .then(() => {
          subscribeOne(subscriptionId);
        })
        .catch((err) => {
          console.warn("WebSocket store subscription failed", err);
          scheduleReconnect();
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
      manuallyClosed = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (ws) {
        ws.close();
      }
    }
  };
}

export const quadrantsWsStoreClient = createQuadrantsWsStoreClient();