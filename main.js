const { app, protocol, BrowserWindow } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { Readable } = require("node:stream");

const createWindow = (url) => {
  const win = new BrowserWindow({
    //show: false,
    width: 800,
    height: 600,
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js')
    },
  });

  win.loadURL(url);
  win.webContents.openDevTools();
  //win.once('ready-to-show', () => {
  //  win.show();
  //});
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "my",
    privileges: {
      standard: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
      bypassCSP: false,
    },
  },
]);

app.whenReady().then(() => {
  protocol.handle("my", (request) => {
    if (!request.url.startsWith("my://")) {
      throw new Error(`Expected protocol my://, got ${request.url}`);
    }

    // One does not simply reassign the protocol of a non-standard URL.
    // So we preprocess the string so it's an ordinary HTTP URL
    // then fiddle with the host portion.
    const url = new URL(request.url.replace(/^my:\/\//, "http://"));
    const host = url.host;
    url.host = "127.0.0.1:8920";
    request.headers.set("Host", host);
    const headers = Object.fromEntries([...request.headers.entries()]);
    // TODO AbortControler
    const proxyRequest = http.request(url, {
      method: request.method,
      headers,
    });

    if (request.body) {
      void Readable.fromWeb(request.body).pipeTo(proxyRequest);
      // TODO dangling promise
    } else {
      proxyRequest.end();
    }

    proxyRequest.response
    return new Promise((resolve, reject) => {
      proxyRequest.on("response", (response) => {
        resolve(
          new Response(Readable.toWeb(response), {
            headers: {
              ...response.headers,
              "content-security-policy": "default-src 'self'; img-src 'self'; script-src 'unsafe-eval' 'unsafe-inline'",
            },
          }),
        );
      });
      proxyRequest.on("error", (error) => {
        reject(error);
      });
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  createWindow("my://alice");
  createWindow("my://bob");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
