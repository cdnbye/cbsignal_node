
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
|servers.websockets.compression|boolean|false = DISABLED, true = SHARED_COMPRESSOR (see [details](https://github.com/uNetworking/uWebSockets/blob/master/misc/READMORE.md#settings))|
|servers.websockets.maxConnections|number|The maximum number of WebSocket connections. 0 = no limit.|

## Run on Debug Mode
```sh
DEBUG="*" node ./dist/run-uws-signal.js config.json
```

## Run with Daemon
```sh
sudo npm install pm2 -g
pm2 start pm2.config.js
```

## Run on Cluster Mode
Edit the config.json of all servers in cluster:
```json
{
  "servers": [{
    "server": {
      "port": THIS_PORT
    },
    "websockets": {
      "path": "/*",
      "maxPayloadLength": 65536,
      "compression": false,
      "maxConnections": 0
    }
  }],
  "cluster": {
    "enabled": true,
    "ip": THIS_IP,
    "port": THIS_PORT,
    "nodes": [
      {
        "enabled": true,
        "ip": REMOTE_IP,
        "port": REMOTE_PORT
      },
      ...
    ]
  }
}
```
