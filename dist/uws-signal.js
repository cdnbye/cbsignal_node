"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var _app;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UWebSocketsSignal = void 0;
const string_decoder_1 = require("string_decoder");
// import * as QueryString from 'querystring';
const uWebSockets_js_1 = require("uWebSockets.js");
const Debug = require("debug");
const signaling_1 = require("./signaling");
const crypto = require('crypto');
const limiter_1 = require("limiter");
// eslint-disable-next-line new-cap
const debugWebSockets = Debug("cbsignal:uws-signaler");
const debugWebSocketsEnabled = debugWebSockets.enabled;
// eslint-disable-next-line new-cap
const debugMessages = Debug("cbsignal:uws-signaler-messages");
const debugMessagesEnabled = debugMessages.enabled;
// eslint-disable-next-line new-cap
const debugRequests = Debug("cbsignal:uws-signaler-requests");
const debugRequestsEnabled = debugRequests.enabled;
const decoder = new string_decoder_1.StringDecoder();
class UWebSocketsSignal {
    constructor(signaler, settings) {
        this.signaler = signaler;
        // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
        _app.set(this, void 0);
        this.webSocketsCount = 0;
        this.validateOrigin = false;
        this.securityEnabled = false;
        this.onUpgrade = (res, req, context) => {
            // console.log('An Http connection wants to become WebSocket, URL: ' + req.getUrl() + '!');
            // const upgradeAborted = {aborted: false};
            /* You MUST copy data out of req here, as req is only valid within this immediate callback */
            const url = req.getUrl();
            const secWebSocketKey = req.getHeader('sec-websocket-key');
            const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
            const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');
            // const query = req.getQuery();
            const id = req.getQuery("id");
            const token = req.getQuery("token");
            const origin = req.getHeader("origin");
            if (this.limiter && !this.limiter.tryRemoveTokens(1)) {
                if (debugRequestsEnabled) {
                    debugRequests(this.settings.server.port, "ws-denied url:", url, "reason: reach rate limit");
                }
                res.close();
                return;
            }
            /* This immediately calls open handler, you must not use res after this call */
            res.upgrade({ url, query: { id, token }, origin }, 
            /* Spell these correctly */
            secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context);
        };
        this.onOpen = (ws) => {
            var _a, _b;
            this.webSocketsCount++;
            const url = ws.url;
            const origin = ws.origin;
            const query = ws.query;
            if (debugRequestsEnabled)
                debugRequests("ws query id", query.id, "token", query.token);
            // token
            if (this.securityEnabled) {
                const tokens = (query.token || '').split('-');
                if (tokens.length < 2) {
                    if (debugRequestsEnabled) {
                        debugRequests(this.settings.server.port, "ws-denied url:", url, "token:", query.token);
                    }
                    ws.close();
                    return;
                }
                const now = new Date().getTime() / 1000;
                const maxTimeStampAge = this.settings.access.maxTimeStampAge;
                const sign = tokens[0];
                const tsStr = tokens[1];
                const ts = Number(tsStr);
                if (ts < now - maxTimeStampAge || ts > now + maxTimeStampAge) {
                    if (debugRequestsEnabled) {
                        debugRequests(this.settings.server.port, "ws-denied url:", url, "token:", query.token, "reason: ts expired for", now - ts);
                    }
                    ws.close();
                    return;
                }
                const hmac = crypto.createHmac('md5', this.settings.access.token);
                const up = hmac.update(tsStr + query.id);
                const realSign = up.digest('hex').substring(0, 8);
                if (sign !== realSign) {
                    if (debugRequestsEnabled) {
                        debugRequests(this.settings.server.port, "ws-denied url:", url, "token:", query.token, "reason: token not match");
                    }
                    ws.close();
                    return;
                }
            }
            if ((this.maxConnections !== 0) && (this.webSocketsCount > this.maxConnections)) {
                if (debugRequestsEnabled) {
                    debugRequests(this.settings.server.port, "ws-denied-max-connections url:", url, "origin:", origin, "total:", this.webSocketsCount);
                }
                ws.close();
                return;
            }
            if (debugWebSocketsEnabled) {
                debugWebSockets("connected via URL", url);
            }
            if (this.validateOrigin) {
                const shoulDeny = ((this.settings.access.denyEmptyOrigin && (origin.length === 0))
                    || (((_a = this.settings.access.denyOrigins) === null || _a === void 0 ? void 0 : _a.includes(origin)) === true)
                    || (((_b = this.settings.access.allowOrigins) === null || _b === void 0 ? void 0 : _b.includes(origin)) === false));
                if (shoulDeny) {
                    if (debugRequestsEnabled) {
                        debugRequests(this.settings.server.port, "ws-denied url:", url, "origin:", origin, "total:", this.webSocketsCount);
                    }
                    ws.close();
                    return;
                }
            }
            if (this.signaler.peers.has(query.id)) {
                debugWebSockets(`${query.id} is already exist`);
                ws.close();
                return;
            }
            if (debugRequestsEnabled) {
                debugRequests(this.settings.server.port, "ws-open url:", url, "origin:", origin, "total:", this.webSocketsCount);
            }
            if (ws.sendMessage === undefined) {
                ws.sendMessage = sendMessage;
            }
            try {
                this.signaler.processJoin(query.id, ws);
            }
            catch (e) {
                if (e instanceof signaling_1.SignalError) {
                    debugWebSockets("failed to process join for the peer:", e);
                    ws.close();
                }
                else {
                    throw e;
                }
            }
        };
        this.onMessage = (ws, message) => {
            debugWebSockets("message of size", message.byteLength);
            let json = undefined;
            try {
                json = JSON.parse(decoder.end(new Uint8Array(message)));
            }
            catch (e) {
                debugWebSockets("failed to parse JSON message", e);
                ws.close();
                return;
            }
            if (debugMessagesEnabled) {
                debugMessages("in", (ws.id === undefined) ? "unknown peer" : ws.id, json);
            }
            try {
                this.signaler.processMessage(json, ws);
            }
            catch (e) {
                if (e instanceof signaling_1.SignalError) {
                    debugWebSockets("failed to process message from the peer:", e);
                    ws.close();
                }
                else {
                    throw e;
                }
            }
        };
        this.onClose = (ws, code) => {
            debugWebSockets("onClose ", code);
            this.webSocketsCount--;
            if (ws.sendMessage !== undefined) {
                this.signaler.disconnectPeer(ws);
            }
            debugWebSockets("closed with code", code);
        };
        this.settings = {
            server: Object.assign({ port: 80 }, settings.server),
            websockets: Object.assign({ path: "/*", maxPayloadLength: 64 * 1024, idleTimeout: 300, compression: false, maxConnections: 0 }, settings.websockets),
            access: Object.assign({ allowOrigins: undefined, denyOrigins: undefined, denyEmptyOrigin: false, maxTimeStampAge: 3600 }, settings.access),
        };
        this.maxConnections = this.settings.websockets.maxConnections;
        if (this.settings.access.limitRate) {
            this.limiter = new limiter_1.RateLimiter({ tokensPerInterval: this.settings.access.limitRate, interval: "second" });
        }
        if (this.settings.access.token)
            this.securityEnabled = true;
        this.validateAccess();
        __classPrivateFieldSet(this, _app, (this.settings.server.key_file_name === undefined)
            // eslint-disable-next-line new-cap
            ? uWebSockets_js_1.App(this.settings.server)
            // eslint-disable-next-line new-cap
            : uWebSockets_js_1.SSLApp(this.settings.server));
        this.buildApplication();
    }
    get app() {
        return __classPrivateFieldGet(this, _app);
    }
    get stats() {
        return {
            webSocketsCount: this.webSocketsCount,
        };
    }
    async run() {
        await new Promise((resolve, reject) => {
            __classPrivateFieldGet(this, _app).listen(this.settings.server.port, (token) => {
                if (token === false) {
                    reject(new Error(`failed to listen to ${this.settings.server.port}`));
                }
                else {
                    resolve();
                }
            });
        });
    }
    validateAccess() {
        if (this.settings.access.allowOrigins !== undefined) {
            if (this.settings.access.denyOrigins !== undefined) {
                throw new Error("allowOrigins and denyOrigins can't be set simultaneously");
            }
            else if (!(this.settings.access.allowOrigins instanceof Array)) {
                throw new Error("allowOrigins configuration paramenters should be an array of strings");
            }
        }
        else if ((this.settings.access.denyOrigins !== undefined) && !(this.settings.access.denyOrigins instanceof Array)) {
            throw new Error("denyOrigins configuration paramenters should be an array of strings");
        }
        const origins = (this.settings.access.allowOrigins === undefined
            ? this.settings.access.denyOrigins
            : this.settings.access.allowOrigins);
        if (origins !== undefined) {
            for (const origin of origins) {
                if (typeof origin !== "string") {
                    throw new Error("allowOrigins and denyOrigins configuration paramenters should be arrays of strings");
                }
            }
        }
        this.validateOrigin = (this.settings.access.denyEmptyOrigin
            || (this.settings.access.allowOrigins !== undefined)
            || (this.settings.access.denyOrigins !== undefined));
    }
    buildApplication() {
        __classPrivateFieldGet(this, _app).ws(this.settings.websockets.path, {
            compression: this.settings.websockets.compression ? uWebSockets_js_1.SHARED_COMPRESSOR : uWebSockets_js_1.DISABLED,
            maxPayloadLength: this.settings.websockets.maxPayloadLength,
            idleTimeout: this.settings.websockets.idleTimeout,
            upgrade: this.onUpgrade,
            open: this.onOpen,
            drain: (ws) => {
                if (debugWebSocketsEnabled) {
                    debugWebSockets("drain", ws.getBufferedAmount());
                }
            },
            message: this.onMessage,
            close: this.onClose,
            ping: (ws) => {
                const peer = ws;
                peer.ts = new Date().getTime();
            },
        });
    }
}
exports.UWebSocketsSignal = UWebSocketsSignal;
_app = new WeakMap();
function sendMessage(json, ws) {
    ws.send(JSON.stringify(json), false, false);
    if (debugMessagesEnabled) {
        debugMessages("out", (ws.id === undefined) ? "unknown peer" : ws.id, json);
    }
}
