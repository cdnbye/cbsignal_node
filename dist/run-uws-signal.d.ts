export interface Settings {
    servers: ServerItemSettings[];
    signaler?: Partial<SignalerSettings>;
    websocketsAccess?: Partial<WebSocketsAccessSettings>;
    cluster?: ClusterSettings;
}
export interface SignalerSettings {
    version: string;
}
export interface ServerItemSettings {
    server?: Partial<ServerSettings>;
    websockets?: Partial<WebSocketsSettings>;
}
export interface ServerSettings {
    port: number;
    key_file_name?: string;
    cert_file_name?: string;
    passphrase?: string;
    dh_params_file_name?: string;
    ssl_prefer_low_memory_usage?: boolean;
}
export interface WebSocketsSettings {
    path: string;
    maxPayloadLength: number;
    idleTimeout: number;
    compression: boolean;
    maxConnections: number;
}
export interface WebSocketsAccessSettings {
    allowOrigins?: readonly string[];
    denyOrigins?: readonly string[];
    denyEmptyOrigin: boolean;
    maxTimeStampAge: number;
    token?: string;
    limitRate?: number;
}
export interface ClusterSettings {
    enabled?: boolean;
    ip?: string;
    port?: number;
    nodes?: NodeSettings[];
    maxRetries?: number;
}
export interface NodeSettings {
    ip: string;
    port: number;
    enabled: boolean;
}
