#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_HTTP_PORT = 18088;
const DEFAULT_CURRENCY = "643";

const config = buildConfig();
const rcMap = loadRcResolveMap(config.rcResolveFile);

let chain = Promise.resolve();
let learnedPort = config.autoDetectPort ? null : config.portDevice;

function buildConfig() {
  const arcusBin = process.env.ARCUS_BIN || "/opt/arcus/commandLineTool";
  const arcusDir = process.env.ARCUS_DIR || path.dirname(arcusBin);
  const iniFile = process.env.ARCUS_INI || path.join(arcusDir, "cashreg.ini");
  const ini = parseIniFile(iniFile);
  const envPort = String(process.env.ARCUS_PORT || "").trim();
  const iniPort = String(ini.PORT || "").trim();
  const autoDetectPort = !envPort || /^auto$/i.test(envPort);
  const requestedPort = autoDetectPort ? "" : envPort;

  return {
    arcusBin,
    arcusDir,
    iniFile,
    useWsl: process.env.ARCUS_USE_WSL === "1",
    wslDistro: process.env.ARCUS_WSL_DISTRO || "Ubuntu",
    wslUser: process.env.ARCUS_WSL_USER || "",
    portDevice: requestedPort || iniPort || "/dev/ttyACM0",
    autoDetectPort,
    httpPort: toInt(process.env.ARCUS_BRIDGE_PORT, DEFAULT_HTTP_PORT),
    commandTimeoutMs: toInt(process.env.ARCUS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    defaultCurrency: process.env.ARCUS_CURRENCY || DEFAULT_CURRENCY,
    opSale: toInt(process.env.ARCUS_OP_SALE, 1),
    opRefund: toInt(process.env.ARCUS_OP_REFUND, 3),
    opCancelLast: toInt(process.env.ARCUS_OP_CANCEL_LAST, 2),
    opCancel: toInt(process.env.ARCUS_OP_CANCEL, 4),
    opSettlement: toInt(process.env.ARCUS_OP_SETTLEMENT, 10),
    opPing: toInt(process.env.ARCUS_OP_PING, 201),
    resultFile: path.join(arcusDir, ini.RESULT_FILE || "rc.out"),
    receiptFile: path.join(arcusDir, ini.CHEQ_FILE || "cheq.out"),
    outputDatFile: path.join(
      arcusDir,
      process.env.ARCUS_OUTPUT_DAT_FILE || ini.OUTPUT_FILE || "output.dat",
    ),
    fallbackOutputDatFile: path.join(arcusDir, "output.dat"),
    outputExDatFile: path.join(arcusDir, "output_ex.dat"),
    outputExTxtFile: path.join(arcusDir, "output_ex.txt"),
    rcResolveFile: path.join(
      arcusDir,
      process.env.ARCUS_RC_RESOLVE_FILE || ini.RC_RESOLVE_FILE || "rc_res.ini",
    ),
  };
}

function toInt(value, fallback) {
  const num = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(num) ? num : fallback;
}

function parseIniFile(filePath) {
  const result = {};
  if (!safeExists(filePath)) {
    return result;
  }
  const text = decodeSmart(fs.readFileSync(filePath));
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const rawValue = line.slice(eq + 1).trim();
    const value = rawValue.split("//")[0].trim();
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

function loadRcResolveMap(filePath) {
  const result = {};
  if (!safeExists(filePath)) {
    return result;
  }
  const text = decodeSmart(fs.readFileSync(filePath));
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const code = line.slice(0, eq).trim();
    const desc = line.slice(eq + 1).trim();
    if (code) {
      result[code] = desc;
    }
  }
  return result;
}

function decodeSmart(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) {
    return utf8;
  }
  return decodeCp1251(buffer);
}

function decodeCp1251(buffer) {
  const table = [
    0x0402, 0x0403, 0x201a, 0x0453, 0x201e, 0x2026, 0x2020, 0x2021,
    0x20ac, 0x2030, 0x0409, 0x2039, 0x040a, 0x040c, 0x040b, 0x040f,
    0x0452, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x0098, 0x2122, 0x0459, 0x203a, 0x045a, 0x045c, 0x045b, 0x045f,
    0x00a0, 0x040e, 0x045e, 0x0408, 0x00a4, 0x0490, 0x00a6, 0x00a7,
    0x0401, 0x00a9, 0x0404, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x0407,
    0x00b0, 0x00b1, 0x0406, 0x0456, 0x0491, 0x00b5, 0x00b6, 0x00b7,
    0x0451, 0x2116, 0x0454, 0x00bb, 0x0458, 0x0405, 0x0455, 0x0457,
  ];
  let out = "";
  for (const b of buffer) {
    if (b < 0x80) {
      out += String.fromCharCode(b);
      continue;
    }
    if (b >= 0xc0) {
      out += String.fromCharCode(0x0410 + (b - 0xc0));
      continue;
    }
    out += String.fromCharCode(table[b - 0x80]);
  }
  return out;
}

function safeExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseKeyValueText(text) {
  const out = {};
  for (const row of text.split(/\r?\n/)) {
    const line = row.trim();
    if (!line) {
      continue;
    }
    const match = line.match(/^([^:=]+?)\s*[:=]\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key) {
        out[key] = value;
      }
    }
  }
  return out;
}

function parseReceiptFields(text) {
  const out = {};
  for (const row of text.split(/\r?\n/)) {
    const line = row.trim();
    if (!line) {
      continue;
    }

    if (!out.RRN) {
      const rrnMatch = line.match(/\bRRN\b\s*[:=]\s*(\d{6,})/i);
      if (rrnMatch) {
        out.RRN = rrnMatch[1];
      }
    }

    if (!out.CARD_NUMBER) {
      const cardMatch = line.match(/\b(?:PAN|CARD)\b\s*[:=]\s*([0-9* ]{8,}[0-9*])/i);
      if (cardMatch) {
        out.CARD_NUMBER = cardMatch[1].replace(/\s+/g, "");
      }
    }
  }
  return out;
}

function readOptionalText(filePath) {
  if (!safeExists(filePath)) {
    return null;
  }
  try {
    return decodeSmart(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

function withLock(fn) {
  const next = chain.then(() => fn(), () => fn());
  chain = next.catch(() => undefined);
  return next;
}

function cleanupOutputFiles() {
  const files = [
    config.outputDatFile,
    config.fallbackOutputDatFile,
    config.outputExDatFile,
    config.outputExTxtFile,
    config.resultFile,
    config.receiptFile,
  ];
  for (const filePath of files) {
    try {
      if (safeExists(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // keep going
    }
  }
}

function toWslPath(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (inputPath.startsWith("/")) {
    return inputPath;
  }
  const match = inputPath.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) {
    return inputPath.replace(/\\/g, "/");
  }
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

function bashQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function isLinuxExecutionAllowed() {
  return process.platform === "linux" || (process.platform === "win32" && config.useWsl);
}

function parseLegacyOutputDat(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length === 0) {
    return {};
  }
  const getLine = (index) => (index < lines.length ? lines[index] || null : null);
  const rcCode = normalizeRc(getLine(0));
  const nonEmptyLast = [...lines].reverse().find((line) => line) || "";

  const structured = lines.length >= 9;
  const legacyCardNumber = structured ? getLine(1) : null;
  const legacyTerminalId = structured ? getLine(2) : null;
  const legacyAuthCode = structured ? getLine(3) : null;
  const legacyCardType = structured ? getLine(4) : null;
  const legacyMessage = structured ? getLine(5) : null;
  const legacyAmount = structured ? getLine(6) : null;
  const legacyRrn = structured ? getLine(7) : null;
  const legacyLoyaltyCode = structured ? getLine(8) : null;

  const tailText = lines.slice(9).filter(Boolean).join("\n");
  const extra = tailText ? parseKeyValueText(tailText) : {};

  return {
    legacyRc: rcCode,
    legacyText: legacyMessage || nonEmptyLast || null,
    legacyCardNumber,
    legacyTerminalId,
    legacyAuthCode,
    legacyCardType,
    legacyAmount,
    legacyRrn,
    legacyLoyaltyCode,
    ...extra,
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function pickDataField(data, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = firstNonEmpty(data[key]);
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function extractPanDigits(rawCardValue) {
  if (!rawCardValue) {
    return "";
  }
  const beforeSeparator = String(rawCardValue).split("=")[0];
  const digits = beforeSeparator.replace(/\D/g, "");
  return digits.length >= 8 ? digits : "";
}

function buildFiscalizationFields(data) {
  const rrnRaw = pickDataField(data, [
    "RRN",
    "rrn",
    "Rrn",
    "REFERENCE_NUMBER",
    "referenceNumber",
    "reference.number",
    "REF_NUM",
    "REFNUM",
    "legacyRrn",
  ]);
  const rrnMatch = rrnRaw ? rrnRaw.match(/(\d{6,})/) : null;
  const rrn = rrnMatch ? rrnMatch[1] : null;

  const authCode = pickDataField(data, ["AUTH_CODE", "authCode", "AUTHCODE", "legacyAuthCode"]);
  const terminalId = pickDataField(data, [
    "TERMINAL_ID",
    "terminalId",
    "TERMINAL",
    "legacyTerminalId",
  ]);
  const receiptNumber = pickDataField(data, ["RECEIPT_NUMBER", "receiptNumber", "CHECK_NUMBER"]);

  const rawCard = pickDataField(data, [
    "CARD_NUMBER",
    "cardNumber",
    "PAN",
    "pan",
    "TRACK2",
    "track2",
    "TRACK_2",
    "legacyCardNumber",
  ]);
  const panDigits = extractPanDigits(rawCard);
  const cardFirst4 = panDigits ? panDigits.slice(0, 4) : null;
  const cardLast4 = panDigits ? panDigits.slice(-4) : null;

  return {
    rrn,
    cardFirst4,
    cardLast4,
    authCode,
    terminalId,
    receiptNumber,
  };
}

function addCanonicalFiscalFields(data, fiscalization) {
  const out = { ...data };
  if (fiscalization.rrn && !out.RRN) {
    out.RRN = fiscalization.rrn;
  }
  if (fiscalization.authCode && !out.AUTH_CODE) {
    out.AUTH_CODE = fiscalization.authCode;
  }
  if (fiscalization.terminalId && !out.TERMINAL_ID) {
    out.TERMINAL_ID = fiscalization.terminalId;
  }
  if (fiscalization.receiptNumber && !out.RECEIPT_NUMBER) {
    out.RECEIPT_NUMBER = fiscalization.receiptNumber;
  }
  if (fiscalization.cardFirst4) {
    out.CARD_FIRST4 = fiscalization.cardFirst4;
  }
  if (fiscalization.cardLast4) {
    out.CARD_LAST4 = fiscalization.cardLast4;
  }
  if (fiscalization.cardFirst4 && fiscalization.cardLast4) {
    out.CARD_MASK = `${fiscalization.cardFirst4}******${fiscalization.cardLast4}`;
  }
  return out;
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function runWslBashSync(script, timeoutMs = 6000) {
  const args = [
    "-d",
    config.wslDistro,
    ...(config.wslUser ? ["-u", config.wslUser] : []),
    "--",
    "bash",
    "-lc",
    script,
  ];
  try {
    const result = spawnSync("wsl.exe", args, {
      encoding: "utf8",
      timeout: timeoutMs,
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      return "";
    }
    return String(result.stdout || "").trim();
  } catch {
    return "";
  }
}

function listCandidatePortsLinux() {
  const out = [];
  try {
    const byIdDir = "/dev/serial/by-id";
    if (safeExists(byIdDir)) {
      const names = fs.readdirSync(byIdDir);
      for (const name of names) {
        if (/PAX/i.test(name) && /if01$/i.test(name)) {
          out.push(path.posix.join(byIdDir, name));
        }
      }
      for (const name of names) {
        if (/PAX/i.test(name) && /if03$/i.test(name)) {
          out.push(path.posix.join(byIdDir, name));
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    const byPathDir = "/dev/serial/by-path";
    if (safeExists(byPathDir)) {
      const names = fs.readdirSync(byPathDir);
      for (const name of names) {
        if (/:1\.1$/.test(name)) {
          out.push(path.posix.join(byPathDir, name));
        }
      }
      for (const name of names) {
        if (/:1\.3$/.test(name)) {
          out.push(path.posix.join(byPathDir, name));
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    const devNames = fs.readdirSync("/dev");
    for (const name of devNames) {
      if (/^ttyACM\d+$/i.test(name)) {
        out.push(`/dev/${name}`);
      }
    }
  } catch {
    // ignore
  }

  return uniq(out);
}

function listCandidatePortsWsl() {
  const script = [
    "ls -1 /dev/serial/by-id/*PAX*if01 2>/dev/null || true",
    "ls -1 /dev/serial/by-id/*PAX*if03 2>/dev/null || true",
    "ls -1 /dev/serial/by-path/*:1.1 2>/dev/null || true",
    "ls -1 /dev/serial/by-path/*:1.3 2>/dev/null || true",
    "ls -1 /dev/ttyACM* 2>/dev/null || true",
  ].join("; ");
  const text = runWslBashSync(script);
  if (!text) {
    return [];
  }
  return uniq(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function listCandidatePorts() {
  if (process.platform === "linux") {
    return listCandidatePortsLinux();
  }
  if (process.platform === "win32" && config.useWsl) {
    return listCandidatePortsWsl();
  }
  return [];
}

function portExists(portPath) {
  if (!portPath) {
    return false;
  }
  if (process.platform === "linux") {
    return safeExists(portPath);
  }
  if (process.platform === "win32" && config.useWsl) {
    const out = runWslBashSync(`[ -e ${bashQuote(portPath)} ] && echo 1 || echo 0`);
    return out === "1";
  }
  return false;
}

function resolveToTtyPort(portPath) {
  if (!portPath) {
    return "";
  }
  if (/^\/dev\/tty/i.test(portPath)) {
    return portPath;
  }
  if (process.platform === "linux") {
    try {
      const resolved = fs.realpathSync(portPath);
      return /^\/dev\/tty/i.test(resolved) ? resolved : "";
    } catch {
      return "";
    }
  }
  if (process.platform === "win32" && config.useWsl) {
    const out = runWslBashSync(`readlink -f ${bashQuote(portPath)} 2>/dev/null || true`);
    const line = out.split(/\r?\n/).map((x) => x.trim()).find(Boolean) || "";
    return /^\/dev\/tty/i.test(line) ? line : "";
  }
  return "";
}

function resolvePort(overridePort) {
  if (overridePort) {
    return resolveToTtyPort(overridePort) || overridePort;
  }
  if (!config.autoDetectPort) {
    return resolveToTtyPort(config.portDevice) || config.portDevice;
  }
  if (learnedPort && portExists(learnedPort)) {
    return learnedPort;
  }
  const candidates = listCandidatePorts();
  for (const candidate of candidates) {
    const ttyPort = resolveToTtyPort(candidate) || candidate;
    if (portExists(ttyPort)) {
      learnedPort = ttyPort;
      return learnedPort;
    }
  }
  return config.portDevice || "/dev/ttyACM0";
}

function buildArcusArgs(input) {
  const args = [`/o${input.opCode}`];
  if (input.amountMinor != null) {
    args.push(`/a${input.amountMinor}`);
  }
  if (input.currency != null) {
    args.push(`/c${input.currency}`);
  }
  if (input.originalAmountMinor != null) {
    args.push(`/h${input.originalAmountMinor}`);
  }
  if (input.track2) {
    args.push(`/t${input.track2}`);
  }
  if (input.terminalId) {
    args.push(`/i${input.terminalId}`);
  }
  if (input.authCode) {
    args.push(`/v${input.authCode}`);
  }
  if (input.rrn) {
    args.push(`/r${input.rrn}`);
  }
  if (input.originalDateTime) {
    args.push(`/f${input.originalDateTime}`);
  }
  if (input.traceId) {
    args.push(`/b${input.traceId}`);
  }
  if (input.paymentData) {
    args.push(`--payment-data=${input.paymentData}`);
  }
  if (input.printFile) {
    args.push(`--print-file=${input.printFile}`);
  }
  const selectedPort = input.port;
  if (selectedPort) {
    args.push(`--port=${selectedPort}`);
  }
  return args;
}

function runCommand(args) {
  return withLock(
    () =>
      new Promise((resolve, reject) => {
        if (!isLinuxExecutionAllowed()) {
          reject(new Error("Arcus bridge must run on Linux host (or Windows with ARCUS_USE_WSL=1)"));
          return;
        }
        if (!safeExists(config.arcusBin)) {
          reject(new Error(`Arcus binary not found: ${config.arcusBin}`));
          return;
        }

        cleanupOutputFiles();

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        let child;
        if (process.platform === "linux") {
          const env = {
            ...process.env,
            LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH
              ? `${config.arcusDir}:${process.env.LD_LIBRARY_PATH}`
              : config.arcusDir,
          };

          child = spawn(config.arcusBin, args, {
            cwd: config.arcusDir,
            env,
            stdio: ["ignore", "pipe", "pipe"],
          });
        } else {
          const wslArcusDir = toWslPath(config.arcusDir);
          const wslArcusBin = toWslPath(config.arcusBin);
          const quotedArgs = args.map((arg) => bashQuote(arg)).join(" ");
          const cmd = [
            `cd ${bashQuote(wslArcusDir)}`,
            `export LD_LIBRARY_PATH=${bashQuote(wslArcusDir)}:$LD_LIBRARY_PATH`,
            `${bashQuote(wslArcusBin)} ${quotedArgs}`.trim(),
          ].join(" && ");

          child = spawn(
            "wsl.exe",
            [
              "-d",
              config.wslDistro,
              ...(config.wslUser ? ["-u", config.wslUser] : []),
              "--",
              "bash",
              "-lc",
              cmd,
            ],
            {
              cwd: config.arcusDir,
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
        }

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, config.commandTimeoutMs);

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString("utf8");
        });

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf8");
        });

        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });

        child.on("close", (code, signal) => {
          clearTimeout(timer);

          const outputDatText =
            readOptionalText(config.outputDatFile) || readOptionalText(config.fallbackOutputDatFile);
          const outputExDatText = readOptionalText(config.outputExDatFile);
          const outputExTxtText = readOptionalText(config.outputExTxtFile);
          const rcText = readOptionalText(config.resultFile);
          const receiptText = readOptionalText(config.receiptFile);

          const outputDat = outputDatText ? parseLegacyOutputDat(outputDatText) : {};
          const outputExDat = outputExDatText ? parseKeyValueText(outputExDatText) : {};
          const outputExTxt = outputExTxtText ? parseKeyValueText(outputExTxtText) : {};
          const receiptData = receiptText ? parseReceiptFields(receiptText) : {};
          const mergedData = { ...receiptData, ...outputDat, ...outputExDat, ...outputExTxt };
          const fiscalization = buildFiscalizationFields(mergedData);
          const normalizedData = addCanonicalFiscalFields(mergedData, fiscalization);
          const rcCode = normalizeRc(
            outputExTxt.responseCode ||
              outputExDat.RC ||
              outputExDat.responseCode ||
              outputDat.legacyRc ||
              (rcText || "").trim(),
          );
          const rcDescription =
            rcMap[rcCode] || outputExDat.TEXT_MSG || outputDat.legacyText || null;
          const success = rcCode === "000" || rcCode === "001" || rcCode === "003" || rcCode === "020";

          const result = {
            ok: !timedOut && code === 0 && success,
            timedOut,
            exitCode: code,
            signal,
            rc: rcCode || null,
            rcDescription,
            data: normalizedData,
            fiscalization,
            stdout: stdout.trim() || null,
            stderr: stderr.trim() || null,
            receipt: receiptText || null,
          };

          if (timedOut) {
            reject(new Error(`Arcus command timeout after ${config.commandTimeoutMs} ms`));
            return;
          }

          resolve(result);
        });
      }),
  );
}

function normalizeRc(value) {
  if (!value) {
    return "";
  }
  const clean = String(value).trim();
  if (/^\d{3}$/.test(clean)) {
    return clean;
  }
  const match = clean.match(/\b(\d{3})\b/);
  return match ? match[1] : clean;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

function requirePositiveInt(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Field '${field}' must be a positive integer`);
  }
}

async function handleOperation(opCode, body, options = {}) {
  const resolvedPort = resolvePort(body.port);
  const input = {
    opCode,
    amountMinor: body.amountMinor,
    currency: body.currency || config.defaultCurrency,
    originalAmountMinor: body.originalAmountMinor,
    track2: body.track2,
    terminalId: body.terminalId,
    authCode: body.authCode,
    rrn: body.rrn,
    originalDateTime: body.originalDateTime,
    traceId: body.traceId,
    paymentData: body.paymentData,
    printFile: body.printFile,
    port: resolvedPort,
  };

  if (options.requireAmount) {
    requirePositiveInt(input.amountMinor, "amountMinor");
  }
  if (input.originalAmountMinor != null) {
    requirePositiveInt(input.originalAmountMinor, "originalAmountMinor");
  }

  const args = buildArcusArgs(input);
  const result = await runCommand(args);
  if (result.rc === "000" && resolvedPort) {
    learnedPort = resolvedPort;
  }
  return { ...result, operationCode: opCode, args, selectedPort: resolvedPort };
}

function onRequest(req, res) {
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, {
      ok: true,
      platform: process.platform,
      useWsl: config.useWsl,
      wslDistro: config.wslDistro,
      wslUser: config.wslUser || null,
      arcusBin: config.arcusBin,
      arcusDir: config.arcusDir,
      portDevice: config.portDevice,
      autoDetectPort: config.autoDetectPort,
      selectedPort: resolvePort(null),
      candidatePorts: listCandidatePorts(),
    });
    return;
  }
  if (req.method === "GET" && req.url === "/ports") {
    json(res, 200, {
      ok: true,
      autoDetectPort: config.autoDetectPort,
      configuredPort: config.portDevice,
      selectedPort: resolvePort(null),
      candidatePorts: listCandidatePorts(),
    });
    return;
  }

  if (req.method !== "POST") {
    json(res, 404, { ok: false, error: "Not found" });
    return;
  }

  parseJsonBody(req)
    .then(async (body) => {
      switch (req.url) {
        case "/api/ping":
          return handleOperation(config.opPing, body);
        case "/api/sale":
          return handleOperation(config.opSale, body, { requireAmount: true });
        case "/api/refund":
          return handleOperation(config.opRefund, body, { requireAmount: true });
        case "/api/cancel-last":
          return handleOperation(config.opCancelLast, body);
        case "/api/cancel":
          return handleOperation(config.opCancel, body);
        case "/api/settlement":
          return handleOperation(config.opSettlement, body);
        case "/api/run": {
          const opCode = Number.parseInt(String(body.opCode), 10);
          requirePositiveInt(opCode, "opCode");
          return handleOperation(opCode, body, {
            requireAmount: body.amountMinor != null,
          });
        }
        default:
          throw new HttpError(404, "Not found");
      }
    })
    .then((result) => {
      json(res, 200, result);
    })
    .catch((error) => {
      const status = error instanceof HttpError ? error.status : 400;
      json(res, status, { ok: false, error: error.message });
    });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const server = http.createServer(onRequest);
server.listen(config.httpPort, "0.0.0.0", () => {
  const runtime = {
    message: "Arcus bridge started",
    platform: process.platform,
    useWsl: config.useWsl,
    wslDistro: config.wslDistro,
    wslUser: config.wslUser || null,
    httpPort: config.httpPort,
    arcusBin: config.arcusBin,
    arcusDir: config.arcusDir,
    iniFile: config.iniFile,
    portDevice: config.portDevice,
    autoDetectPort: config.autoDetectPort,
    selectedPort: resolvePort(null),
  };
  process.stdout.write(`${JSON.stringify(runtime)}\n`);
});
