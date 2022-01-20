import { TemplatedApp } from "uWebSockets.js";
import { Signaling } from "./signaling";
import { ServerSettings, WebSocketsSettings, WebSocketsAccessSettings } from "./run-uws-signal";
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
export declare class UWebSocketsSignal {
    #private;
    readonly signaler: Readonly<Signaling>;
    readonly settings: UwsSignalSettings;
    private webSocketsCount;
    private validateOrigin;
    private securityEnabled;
    private limiter?;
    private readonly maxConnections;
    get app(): TemplatedApp;
    get stats(): {
        webSocketsCount: number;
    };
    constructor(signaler: Readonly<Signaling>, settings: PartialUwsSignalSettings);
    run(): Promise<void>;
    private validateAccess;
    private buildApplication;
    private readonly onUpgrade;
    private readonly onOpen;
    private readonly onMessage;
    private readonly onClose;
}
