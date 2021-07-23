
import { StringDecoder } from "string_decoder";
import * as QueryString from 'querystring';
import { App, SSLApp, WebSocket, us_socket_context_t, HttpResponse, HttpRequest, TemplatedApp, SHARED_COMPRESSOR, DISABLED } from "uWebSockets.js";
import * as Debug from "debug";
import { Signaling, SignalError, PeerContext } from "./signaling";
import { ServerSettings, WebSocketsSettings, WebSocketsAccessSettings } from "./run-uws-signal";
const crypto = require('crypto');
import { RateLimiter } from "limiter";

// eslint-disable-next-line new-cap
const debugWebSockets = Debug("wt-signaler:uws-signaler");
// debugWebSockets.enabled = true;
const debugWebSocketsEnabled = debugWebSockets.enabled;

// eslint-disable-next-line new-cap
const debugMessages = Debug("wt-signaler:uws-signaler-messages");
// debugMessages.enabled = true;
const debugMessagesEnabled = debugMessages.enabled;

// eslint-disable-next-line new-cap
const debugRequests = Debug("wt-signaler:uws-signaler-requests");
// debugRequests.enabled = true;
const debugRequestsEnabled = debugRequests.enabled;

const decoder = new StringDecoder();

export interface UwsSignalSettings {
    server: ServerSettings;
    websockets: WebSocketsSettings;
    access: WebSocketsAccessSettings;
}

export interface PartialUwsSignalSettings {
    server?: Partial<ServerSettings>;
    websockets?: Partial<WebSocketsSettings>;
    access?: Partial<WebSocketsAccessSettings>;
}

export class UWebSocketsSignal {
    public readonly settings: UwsSignalSettings;

    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    readonly #app: TemplatedApp;

    private webSocketsCount = 0;
    private validateOrigin = false;
    private securityEnabled = false;
    private limiter?: RateLimiter;
    private readonly maxConnections: number;

    public get app(): TemplatedApp {
        return this.#app;
    }

    public get stats(): { webSocketsCount: number } {
        return {
            webSocketsCount: this.webSocketsCount,
        };
    }

    public constructor(public readonly signaler: Readonly<Signaling>, settings: PartialUwsSignalSettings) {
        this.settings = {
            server: {
                port: 80,
                ...settings.server,
            },
            websockets: {
                path: "/*",
                maxPayloadLength: 64 * 1024,
                idleTimeout: 300,
                compression: false,
                maxConnections: 0,
                ...settings.websockets,
            },
            access: {
                allowOrigins: undefined,
                denyOrigins: undefined,
                denyEmptyOrigin: false,
                maxTimeStampAge: 3600,
                ...settings.access,
            },
        };

        this.maxConnections = this.settings.websockets.maxConnections;
        if (this.settings.access.limitRate) {
            this.limiter = new RateLimiter({ tokensPerInterval: this.settings.access.limitRate, interval: "second" });
        }

        if (this.settings.access.token) this.securityEnabled = true;

        this.validateAccess();

        this.#app = (this.settings.server.key_file_name === undefined)
            // eslint-disable-next-line new-cap
            ? App(this.settings.server)
            // eslint-disable-next-line new-cap
            : SSLApp(this.settings.server);

        this.buildApplication();
    }

    public async run(): Promise<void> {
        await new Promise<void>(
            (resolve, reject) => {
                this.#app.listen(
                    this.settings.server.port,
                    (token: false | object) => {
                        if (token === false) {
                            reject(new Error(
                                `failed to listen to ${this.settings.server.port}`,
                            ));
                        } else {
                            resolve();
                        }
                    },
                );
            },
        );
    }

    private validateAccess(): void {
        if (this.settings.access.allowOrigins !== undefined) {
            if (this.settings.access.denyOrigins !== undefined) {
                throw new Error("allowOrigins and denyOrigins can't be set simultaneously");
            } else if (!(this.settings.access.allowOrigins instanceof Array)) {
                throw new Error("allowOrigins configuration paramenters should be an array of strings");
            }
        } else if ((this.settings.access.denyOrigins !== undefined) && !(this.settings.access.denyOrigins instanceof Array)) {
            throw new Error("denyOrigins configuration paramenters should be an array of strings");
        }

        const origins: string[] | undefined = (this.settings.access.allowOrigins === undefined
            ? this.settings.access.denyOrigins
            : this.settings.access.allowOrigins);

        if (origins !== undefined) {
            for (const origin of origins) {
                if (typeof origin !== "string") {
                    throw new Error("allowOrigins and denyOrigins configuration paramenters should be arrays of strings");
                }
            }
        }

        this.validateOrigin = (
            this.settings.access.denyEmptyOrigin
            || (this.settings.access.allowOrigins !== undefined)
            || (this.settings.access.denyOrigins !== undefined)
        );
    }

    private buildApplication(): void {
        this.#app.ws(
            this.settings.websockets.path,
            {
                compression: this.settings.websockets.compression ? SHARED_COMPRESSOR : DISABLED,
                maxPayloadLength: this.settings.websockets.maxPayloadLength,
                idleTimeout: this.settings.websockets.idleTimeout,
                upgrade: this.onUpgrade,
                open: this.onOpen,
                drain: (ws: WebSocket) => {
                    if (debugWebSocketsEnabled) {
                        debugWebSockets("drain", ws.getBufferedAmount());
                    }
                },
                message: this.onMessage,
                close: this.onClose,
            },
        );
    }

    private readonly onUpgrade = (res: HttpResponse, req: HttpRequest, context: us_socket_context_t): void => {
        // console.log('An Http connection wants to become WebSocket, URL: ' + req.getUrl() + '!');

        // const upgradeAborted = {aborted: false};

        /* You MUST copy data out of req here, as req is only valid within this immediate callback */
        const url = req.getUrl();
        const secWebSocketKey = req.getHeader('sec-websocket-key');
        const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
        const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');
        const query = req.getQuery();
        const origin = req.getHeader("origin");

        if (this.limiter && !this.limiter.tryRemoveTokens(1)) {
            if (debugRequestsEnabled) {
                debugRequests(
                    this.settings.server.port,
                    "ws-denied url:",
                    url,
                    "reason: reach rate limit"
                );
            }
            res.close();
            return;
        }

        /* This immediately calls open handler, you must not use res after this call */
        res.upgrade({ url, query, origin },
            /* Spell these correctly */
            secWebSocketKey,
            secWebSocketProtocol,
            secWebSocketExtensions,
            context);

    };

    private readonly onOpen = (ws: WebSocket): void => {
        this.webSocketsCount++;
        const url = ws.url;
        const queryStr = ws.query;
        const origin = ws.origin;
        const query = QueryString.parse(queryStr);
        if (debugRequestsEnabled) debugRequests("ws query id", query.id, "token", query.token);

        // token
        if (this.securityEnabled) {
            const tokens = (query.token as string || '').split('-');
            if (tokens.length < 2) {
                if (debugRequestsEnabled) {
                    debugRequests(
                        this.settings.server.port,
                        "ws-denied url:",
                        url,
                        "query:",
                        queryStr,
                        "token:",
                        query.token
                    );
                }
                ws.close();
                return;
            }
            const now = new Date().getTime()/1000;
            const maxTimeStampAge = this.settings.access.maxTimeStampAge;
            const sign = tokens[0];
            const tsStr = tokens[1];
            const ts = Number(tsStr);
            if (ts<now-maxTimeStampAge || ts>now+maxTimeStampAge) {
                if (debugRequestsEnabled) {
                    debugRequests(
                        this.settings.server.port,
                        "ws-denied url:",
                        url,
                        "query:",
                        queryStr,
                        "token:",
                        query.token,
                        "reason: ts expired for",
                        now - ts
                    );
                }
                ws.close();
                return;
            }
            const hmac = crypto.createHmac('md5', this.settings.access.token);
            const up = hmac.update(tsStr + query.id);
            const realSign = (up.digest('hex') as string).substring(0, 8);
            if (sign !== realSign) {
                if (debugRequestsEnabled) {
                    debugRequests(
                        this.settings.server.port,
                        "ws-denied url:",
                        url,
                        "query:",
                        queryStr,
                        "token:",
                        query.token,
                        "reason: token not match"
                    );
                }
                ws.close();
                return;
            }
        }

        if ((this.maxConnections !== 0) && (this.webSocketsCount > this.maxConnections)) {
            if (debugRequestsEnabled) {
                debugRequests(
                    this.settings.server.port,
                    "ws-denied-max-connections url:",
                    url,
                    "query:",
                    queryStr,
                    "origin:",
                    origin,
                    "total:",
                    this.webSocketsCount,
                );
            }
            ws.close();
            return;
        }

        if (debugWebSocketsEnabled) {
            debugWebSockets("connected via URL", url);
        }

        if (this.validateOrigin) {

            const shoulDeny = (
                (this.settings.access.denyEmptyOrigin && (origin.length === 0))
                || (this.settings.access.denyOrigins?.includes(origin) === true)
                || (this.settings.access.allowOrigins?.includes(origin) === false)
            );

            if (shoulDeny) {
                if (debugRequestsEnabled) {
                    debugRequests(
                        this.settings.server.port,
                        "ws-denied url:",
                        url,
                        "query:",
                        queryStr,
                        "origin:",
                        origin,
                        "total:",
                        this.webSocketsCount,
                    );
                }
                ws.close();
                return;
            }
        }

        if (debugRequestsEnabled) {
            debugRequests(
                this.settings.server.port,
                "ws-open url:",
                url,
                "query:",
                queryStr,
                "origin:",
                origin,
                "total:",
                this.webSocketsCount,
            );
        }

        if (ws.sendMessage === undefined) {
            ws.sendMessage = sendMessage;
        }

        try {
            this.signaler.processJoin(query.id as string, ws as unknown as PeerContext);
        } catch (e) {
            if (e instanceof SignalError) {
                debugWebSockets("failed to process join for the peer:", e);
                ws.close();
            } else {
                throw e;
            }
        }
    };

    private readonly onMessage = (ws: WebSocket, message: ArrayBuffer): void => {
        debugWebSockets("message of size", message.byteLength);

        let json: object | undefined = undefined;
        try {
            json = JSON.parse(decoder.end(new Uint8Array(message) as Buffer)) as object;
        } catch (e) {
            debugWebSockets("failed to parse JSON message", e);
            ws.close();
            return;
        }

        if (debugMessagesEnabled) {
            debugMessages(
                "in",
                (ws.id === undefined) ? "unknown peer" : ws.id,
                json,
            );
        }

        try {
            this.signaler.processMessage(json, ws as unknown as PeerContext);
        } catch (e) {
            if (e instanceof SignalError) {
                debugWebSockets("failed to process message from the peer:", e);
                ws.close();
            } else {
                throw e;
            }
        }
    };

    private readonly onClose = (ws: WebSocket, code: number): void => {
        debugWebSockets("onClose ", code);
        this.webSocketsCount--;

        if (ws.sendMessage !== undefined) {
            this.signaler.disconnectPeer(ws as unknown as PeerContext);
        }

        debugWebSockets("closed with code", code);
    };
}

function sendMessage(json: object, ws: WebSocket): void {
    ws.send(JSON.stringify(json), false, false);
    if (debugMessagesEnabled) {
        debugMessages(
            "out",
            (ws.id === undefined) ? "unknown peer" : ws.id,
            json,
        );
    }
}
