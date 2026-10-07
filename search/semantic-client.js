export class SemanticClient {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.worker = null;
    this.ready = false;
    this.requests = new Map();
    this.nextId = 0;
    this.startupTimer = null;
  }

  start(model = "minilm") {
    this.stop();
    if (typeof Worker !== "function" || typeof WebAssembly !== "object") {
      this.onStatus({ state: "error", message: "This browser does not support on-device inference. Basic matching remains available." });
      return;
    }
    this.onStatus({ state: "loading", message: "Loading the on-device model. Your clues stay here." });
    try {
      this.worker = new Worker(new URL("./semantic-worker.js", import.meta.url), { type: "module" });
    } catch (error) {
      this.onStatus({ state: "error", message: `The model worker could not start: ${error.message}` });
      return;
    }
    this.startupTimer = setTimeout(() => {
      this.stop();
      this.onStatus({ state: "error", message: "The local model took too long to load. Basic matching remains available; retry when ready." });
    }, 60000);
    this.worker.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "ready") {
        clearTimeout(this.startupTimer);
        this.ready = true;
        this.onStatus({ state: "ready", message: `On-device semantic search ready (${message.model}).` });
      } else if (message.type === "progress") {
        this.onStatus({ state: "loading", message: message.message });
      } else if (message.type === "result") {
        const pending = this.requests.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.requests.delete(message.requestId);
          pending.resolve(message.result);
        }
      } else if (message.type === "error") {
        const pending = this.requests.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.requests.delete(message.requestId);
          pending.reject(new Error(message.message));
        } else {
          clearTimeout(this.startupTimer);
          this.ready = false;
          this.onStatus({ state: "error", message: message.message });
        }
      }
    });
    this.worker.addEventListener("error", () => {
      this.stop();
      this.onStatus({ state: "error", message: "The local model worker failed. Basic matching remains available; retry the model when ready." });
    });
    this.worker.postMessage({ type: "initialize", model });
  }

  search(query, customWords) {
    if (!this.ready) return Promise.reject(new Error("The on-device model is not ready."));
    const requestId = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(requestId);
        reject(new Error("On-device search timed out. Try again or use basic matching."));
      }, 20000);
      this.requests.set(requestId, { resolve, reject, timer });
      this.worker.postMessage({ type: "search", requestId, query, customWords });
    });
  }

  stop() {
    clearTimeout(this.startupTimer);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("On-device search was stopped."));
    }
    this.requests.clear();
  }
}
