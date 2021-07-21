
# About
High performance CDNBye signaling service written in node.js

## Features

* handles more than 40k WebSocket Secure (HTTPS) peers on a VPS with only 2 GiB memory and 1 virtual CPU thanks to [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) I/O backend and perfomance optimizations in the code
* handles ws:// (HTTP) and wss:// (HTTPS) connections simultaneously
* IPv4 and IPv6 support
* robust and well-tested: CI, unit tests, static code analyzis, 100% TypeScript
* statistics under /info URL

## Related projects

* [cbsignal](https://github.com/cdnbye/cbsignal) - High performance CDNBye signaling service written in golang

## Build instructions

Node.js 10+ is required.

```sh
npm install
npm run compile
```

## Run instructions

```sh
./bin/cbsignal [config.json]
```

or

```sh
node dist/run-uws-signal.js [config.json]
```

or

```sh
npm start [config.json]
```

## Configuration

See [sample](sample)

|Name|Type|Description|
|----|----|-----------|
|servers.websockets.path|string|URL pattern for the WebSockets endpoint|
|servers.websockets.maxPayloadLength|number|The maximum length of received message|
|servers.websockets.idleTimeout|number|The maximum amount of seconds that may pass without sending or getting a message. Being idle for more than this, and the connection is severed.|
|servers.websockets.compression|0,1,2|0 = no compression, 1 = shared compressor, 2 = dedicated compressor (see [details](https://github.com/uNetworking/uWebSockets/blob/master/misc/READMORE.md#settings))|
|servers.websockets.maxConnections|number|The maximum number of WebSocket connections. 0 = no limit.|

## Run on Debug Mode
```sh
DEBUG="*" node ./dist/run-uws-signal.js config.json
```
