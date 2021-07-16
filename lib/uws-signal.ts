
import { StringDecoder } from "string_decoder";
import * as QueryString from 'querystring';
import { App, SSLApp, WebSocket, HttpRequest, TemplatedApp } from "uWebSockets.js";
import * as Debug from "debug";
import { Signaling, SignalError, PeerContext } from "./signaling";
import { ServerSettings, WebSocketsSettings, WebSocketsAccessSettings } from "./run-uws-signal";

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
                port: 8000,
                host: "0.0.0.0",
                ...settings.server,
            },
            websockets: {
                path: "/*",
                maxPayloadLength: 64 * 1024,
                idleTimeout: 240,
                compression: 1,
                maxConnections: 0,
                ...settings.websockets,
            },
            access: {
                allowOrigins: undefined,
                denyOrigins: undefined,
                denyEmptyOrigin: false,
                ...settings.access,
            },
        };

        this.maxConnections = this.settings.websockets.maxConnections;

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
                    // this.settings.server.host,
                    this.settings.server.port,
                    (token: false | object) => {
                        if (token === false) {
                            reject(new Error(
                                `failed to listen to ${this.settings.server.host}:${this.settings.server.port}`,
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
                compression: this.settings.websockets.compression,
                maxPayloadLength: this.settings.websockets.maxPayloadLength,
                idleTimeout: this.settings.websockets.idleTimeout,
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

    private readonly onOpen = (ws: WebSocket, request: HttpRequest): void => {
        this.webSocketsCount++;

        if ((this.maxConnections !== 0) && (this.webSocketsCount > this.maxConnections)) {
            if (debugRequestsEnabled) {
                debugRequests(
                    this.settings.server.host,
                    this.settings.server.port,
                    "ws-denied-max-connections url:",
                    request.getUrl(),
                    "query:",
                    request.getQuery(),
                    "origin:",
                    request.getHeader("origin"),
                    "total:",
                    this.webSocketsCount,
                );
            }
            ws.close();
            return;
        }

        if (debugWebSocketsEnabled) {
            debugWebSockets("connected via URL", request.getUrl());
        }

        if (this.validateOrigin) {
            const origin = request.getHeader("origin");

            const shoulDeny = (
                (this.settings.access.denyEmptyOrigin && (origin.length === 0))
                || (this.settings.access.denyOrigins?.includes(origin) === true)
                || (this.settings.access.allowOrigins?.includes(origin) === false)
            );

            if (shoulDeny) {
                if (debugRequestsEnabled) {
                    debugRequests(
                        this.settings.server.host,
                        this.settings.server.port,
                        "ws-denied url:",
                        request.getUrl(),
                        "query:",
                        request.getQuery(),
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
                this.settings.server.host,
                this.settings.server.port,
                "ws-open url:",
                request.getUrl(),
                "query:",
                request.getQuery(),
                "origin:",
                request.getHeader("origin"),
                "total:",
                this.webSocketsCount,
            );
        }

        if (ws.sendMessage === undefined) {
            ws.sendMessage = sendMessage;
        }

        const query = QueryString.parse(request.getQuery());
        if (debugRequestsEnabled) debugRequests("ws query id", query.id);
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

        // if (ws.sendMessage === undefined) {
        //     ws.sendMessage = sendMessage;
        // }

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
