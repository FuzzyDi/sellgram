# Arcus Bridge (Linux)

This bridge wraps Arcus `commandLineTool` and exposes simple HTTP endpoints for cash register integration.

## Requirements

- Linux host connected to PAX pin-pad.
- Arcus files in one folder:
  - `commandLineTool`
  - `libarccom.so`
  - `cashreg.ini`
  - `ops.ini`
- Node.js 20+

## Start

```bash
ARCUS_BIN=/opt/arcus/commandLineTool \
ARCUS_DIR=/opt/arcus \
ARCUS_PORT=/dev/ttyACM0 \
ARCUS_BRIDGE_PORT=18088 \
node scripts/arcus-bridge.js
```

### Windows + WSL mode (for local testing on current machine)

```powershell
$env:ARCUS_USE_WSL='1'
$env:ARCUS_WSL_DISTRO='Ubuntu'
$env:ARCUS_WSL_USER='root'
$env:ARCUS_BIN='E:\Arcus\rabochiy\linux1\commandLineTool'
$env:ARCUS_DIR='E:\Arcus\rabochiy\linux1'
$env:ARCUS_PORT='/dev/ttyACM0'
$env:ARCUS_BRIDGE_PORT='18088'
node scripts/arcus-bridge.js
```

`ARCUS_WSL_USER='root'` is often required because `/dev/ttyACM*` is owned by `root:dialout` and regular users may get connection errors (`RC=999`).

Before first run in WSL, install 32-bit runtime for Arcus:

```bash
wsl -d Ubuntu -u root -- bash -lc "dpkg --add-architecture i386 && apt-get update && apt-get install -y libc6:i386 libstdc++6:i386 libgcc-s1:i386"
```

Or from this repo:

```bash
ARCUS_BIN=/opt/arcus/commandLineTool ARCUS_DIR=/opt/arcus ARCUS_PORT=/dev/ttyACM0 pnpm arcus:bridge
```

## API

- `GET /health`
- `GET /ports` (show detected serial candidates and selected port)
- `POST /api/ping`
- `POST /api/sale`
- `POST /api/refund`
- `POST /api/cancel-last`
- `POST /api/cancel`
- `POST /api/settlement`
- `POST /api/run` (custom operation code)

All `POST` endpoints accept JSON body.

### Sale example

```bash
curl -sS -X POST http://127.0.0.1:18088/api/sale \
  -H 'Content-Type: application/json' \
  -d '{"amountMinor":221,"currency":"643"}'
```

For UZS (`860`) and amount `2000`, Arcus command mapping is:

- `/cashreg /o1 /a2000 /c860` (sale)

### Refund example

```bash
curl -sS -X POST http://127.0.0.1:18088/api/refund \
  -H 'Content-Type: application/json' \
  -d '{"amountMinor":2000,"currency":"860","rrn":"123456789012"}'
```

Arcus command mapping:

- `"/o3 /a{amount} /c860 /r{rrn}"` (refund by RRN)

### Custom operation example

```bash
curl -sS -X POST http://127.0.0.1:18088/api/run \
  -H 'Content-Type: application/json' \
  -d '{"opCode":201}'
```

## Request fields

Common optional fields:

- `port` - override serial port (`/dev/ttyACM0`, `/dev/ttyUSB0`, etc.)
- `currency` - default `643`
- `track2`
- `terminalId`
- `authCode`
- `rrn`
- `originalDateTime`
- `traceId`
- `paymentData`
- `printFile`
- `originalAmountMinor`

For `sale`/`refund`:

- `amountMinor` (required positive integer, example `221` for 2.21)
- `rrn` (required for refund in scenarios where processor requires `/r{rrn}`)

For `/api/run`:

- `opCode` (required positive integer)

## Response fields for fiscalization

Bridge returns parsed operation data in `data` and normalized fiscal fields in `fiscalization`:

- `fiscalization.rrn`
- `fiscalization.cardFirst4`
- `fiscalization.cardLast4`
- `fiscalization.authCode`
- `fiscalization.terminalId`
- `fiscalization.receiptNumber`

For convenience, canonical keys are also added to `data` when available:

- `RRN`
- `CARD_FIRST4`
- `CARD_LAST4`
- `CARD_MASK`
- `AUTH_CODE`
- `TERMINAL_ID`
- `RECEIPT_NUMBER`

Recommended flow:

1. After successful sale, persist `rrn`, `cardFirst4`, `cardLast4` to the receipt (for fiscalization/export).
2. For refund, read stored `rrn` from receipt and send it in `/api/refund`.

Bridge supports values from both `output_ex.dat` and `cheq.out` formats, including:

- `RRN=335207521850`
- `RRN: 335207521850`
- `PAN=986008******3743`
- `CARD: 626291******1516(БЕСКОНТАКТ(W))`

## Notes

- Requests are executed sequentially to avoid Arcus command collisions.
- The bridge reads result files (`output.dat`, `output_ex.dat`, `output_ex.txt`, `rc.out`, `cheq.out`) and returns parsed data in JSON.
- `cashreg.ini` and `ops.ini` control real operation mapping in Arcus.
- If `ARCUS_PORT` is not set (or set to `auto`), bridge auto-detects stable ports in this order:
  - `/dev/serial/by-id/*PAX*if01`
  - `/dev/serial/by-id/*PAX*if03`
  - `/dev/serial/by-path/*:1.1`
  - `/dev/serial/by-path/*:1.3`
  - `/dev/ttyACM*`

For strict fixed mapping, set:

```powershell
$env:ARCUS_PORT='/dev/serial/by-id/usb-PAX_A35_2290268943-if01'
```
