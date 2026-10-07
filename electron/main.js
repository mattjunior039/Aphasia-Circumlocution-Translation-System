import { app, BrowserWindow, dialog, protocol, net } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveAsset, contentType } from "./protocol.js";

const userDataPath = app.commandLine.getSwitchValue("user-data-dir");
if (userDataPath) app.setPath("userData", path.resolve(userDataPath));

protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}]);

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 390,
    minHeight: 600,
    show: false,
    backgroundColor: "#f5f7f4",
    title: "Wordbridge",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://-/")) event.preventDefault();
  });
  try {
    await win.loadURL("app://-/index.html");
  } catch (error) {
    console.error("Desktop page failed to load:", error);
    dialog.showErrorBox("Wordbridge could not start", "The application files could not be loaded. Rebuild or reinstall the current app.");
    win.destroy();
  }
}

app.whenReady().then(async () => {
  const root = path.join(app.getAppPath(), "build", "renderer");
  protocol.handle("app", async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const asset = resolveAsset(root, request.url);
    if (!asset) return new Response("Invalid application asset path", { status: 400 });
    try {
      const response = await net.fetch(pathToFileURL(asset).href);
      const headers = new Headers(response.headers);
      headers.set("Content-Type", contentType(asset));
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(request.method === "HEAD" ? null : response.body, {
        status: response.status,
        headers
      });
    } catch (error) {
      console.error(`Application asset could not be loaded: ${new URL(request.url).pathname}`, error.message);
      return new Response("Application asset not found", { status: 404 });
    }
  });
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}).catch((error) => {
  console.error("Desktop initialization failed:", error);
  dialog.showErrorBox("Wordbridge could not start", error.message);
  app.quit();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
