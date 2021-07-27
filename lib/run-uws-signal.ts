/* eslint-disable no-console */

import { readFileSync } from "fs";
import { HttpResponse, HttpRequest } from "uWebSockets.js";
import * as Debug from "debug";
import { UWebSocketsSignal } from "./uws-signal";
import { FastSignal } from "./fast-signal";
import { Signaling } from "./signaling";
import Cluster from "./cluster";

// eslint-disable-next-line new-cap
const debugRequests = Debug("cbsignal:uws-signaler-requests");
const debugRequestsEnabled = debugRequests.enabled;

interface UnknownObject {
    [key: string]: unknown;
}

export interface Settings {
    servers: ServerItemSettings[];
    signaler?: Partial<SignalerSettings>;
    websocketsAccess?: Partial<WebSocketsAccessSettings>;
    cluster? : ClusterSettings;
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
    // eslint-disable-next-line camelcase
    key_file_name?: string;
    // eslint-disable-next-line camelcase
    cert_file_name?: string;
    passphrase?: string;
    // eslint-disable-next-line camelcase
    dh_params_file_name?: string;
    // eslint-disable-next-line camelcase
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
    ip?: string,
    port?: string,
    nodes?: NodeSettings[];
    maxRetries?: number;
}

export interface NodeSettings {
    ip: string;
    port: number;
    enabled: boolean;
}

async function main(): Promise<void> {
    let settingsFileData: Buffer | undefined = undefined;

    if (process.argv.length <= 2) {
        try {
            settingsFileData = readFileSync("config.json");
        } catch (e) {
            if ((e as { code?: string }).code !== "ENOENT") {
                console.error("failed to read configuration file:", e);
                return;
            }
        }
    } else {
        try {
            settingsFileData = readFileSync(process.argv[2]);
        } catch (e) {
            console.error("failed to read configuration file:", e);
            return;
        }
    }

    let jsonSettings: UnknownObject | undefined = undefined;

    try {
        jsonSettings = (settingsFileData === undefined)
            ? {}
            : JSON.parse(settingsFileData.toString()) as UnknownObject;
    } catch (e) {
        console.error("failed to parse JSON configuration file:", e);
        return;
    }

    const settings = validateSettings(jsonSettings);
    if (settings === undefined) {
        return;
    }

    const signaler = new FastSignal(settings.signaler);

    try {
        await runServers(signaler, settings);
    } catch (e) {
        console.error("failed to start the web server:", e);
    }
}

function validateSettings(jsonSettings: UnknownObject): Settings | undefined {
    if ((jsonSettings.servers !== undefined) && !(jsonSettings.servers instanceof Array)) {
        console.error("failed to parse JSON configuration file: 'servers' property should be an array");
        return undefined;
    }

    const servers: object[] = [];

    if (jsonSettings.servers === undefined) {
        servers.push({});
    } else {
        for (const serverSettings of jsonSettings.servers) {
            if (serverSettings instanceof Object) {
                servers.push(serverSettings);
            } else {
                console.error("failed to parse JSON configuration file: 'servers' property should be an array of objects");
                return undefined;
            }
        }
    }

    if ((jsonSettings.signaler !== undefined) && !(jsonSettings.signaler instanceof Object)) {
        console.error("failed to parse JSON configuration file: 'signaler' property should be an object");
        return undefined;
    }

    if ((jsonSettings.websocketsAccess !== undefined) && !(jsonSettings.websocketsAccess instanceof Object)) {
        console.error("failed to parse JSON configuration file: 'websocketsAccess' property should be an object");
        return undefined;
    }

    if ((jsonSettings.cluster !== undefined) && !(jsonSettings.cluster instanceof Object)) {
        console.error("failed to parse JSON configuration file: 'cluster' property should be an object");
        return undefined;
    }

    return {
        servers: servers,
        signaler: jsonSettings.signaler,
        websocketsAccess: jsonSettings.websocketsAccess,
        cluster: jsonSettings.cluster,
    };
}

async function runServers(
    signaler: Signaling,
    settings: Settings,
): Promise<void> {

    let cluster: Cluster;
    if (settings.cluster && settings.cluster.enabled && settings.cluster.ip && settings.cluster.port) {
        console.log(`cluster mode`);
        cluster = new Cluster(signaler as FastSignal, settings.cluster);
    }

    const servers: UWebSocketsSignal[] = [];

    const serverPromises = settings.servers.map(
        async (serverSettings) => {
            const server = buildServer(signaler, serverSettings, settings.websocketsAccess, signaler.settings, servers, cluster);
            servers.push(server);
            await server.run();
            console.info(`listening ${server.settings.server.port}`);
        },
    );

    await Promise.all(serverPromises);
}

function buildServer(
    signaler: Signaling,
    serverSettings: ServerItemSettings,
    websocketsAccess: Partial<WebSocketsAccessSettings> | undefined,
    signalerSettings: Partial<SignalerSettings> | undefined,
    servers: UWebSocketsSignal[],
    cluster: Cluster | undefined,
): UWebSocketsSignal {
    if (!(serverSettings instanceof Object)) {
        throw Error("failed to parse JSON configuration file: 'servers' property should be an array of objects");
    }

    const server = new UWebSocketsSignal(signaler, { ...serverSettings, access: websocketsAccess });

    server.app
    .post(
        "/cluster",
        (response: HttpResponse, request: HttpRequest) => {
            if (!cluster) {
                const status = "404 Not Found";
                response.writeStatus(status).end(status);
                return;
            }
            const hostName = request.getQuery('host');
            const action = request.getQuery('action');
            if (action === 'peer_join') {
                cluster.processPeerJoin(hostName, request.getQuery('peer_id'));
                response.end();
            } else if (action === 'peer_leave') {
                cluster.processPeerLeave(hostName, request.getQuery('peer_id'));
                response.end();
            } else if (action === 'peer_message') {
                // console.log(`receive node peer_message ${hostName}`);
                readJson(response, (json => {
                    cluster.processPeerMessage(hostName, json);
                    response.end();
                }), ()=> {
                    console.error('readJson error');
                    response.end();
                })
            } else if (action === 'ping') {
                // console.log(`receive node ping ${hostName}`);
                response.end();
            } else if (action === 'register') {
                // console.log(`receive node register ${hostName}`);
                response.end();
            }
        }
    ).get(
        "/info",
        (response: HttpResponse, request: HttpRequest) => {
            debugRequest(server, request);

            const peersCount = signaler.peers.size;

            const serversStats = new Array<{ server: string; webSocketsCount: number }>();
            for (const serverForStats of servers) {
                const settings = serverForStats.settings;
                serversStats.push({
                    server: `${settings.server.port}`,
                    webSocketsCount: serverForStats.stats.webSocketsCount,
                });
            }
            let version: string | undefined = "unknown";
            if (signalerSettings) {
                version = signalerSettings.version;
            }
            let compressionEnabled: boolean = false;
            if (serverSettings.websockets && serverSettings.websockets.compression === true) {
                compressionEnabled = true;
            }
            response.
                writeHeader("Content-Type", "application/json").
                writeHeader("Access-Control-Allow-Origin", "*").
                end(JSON.stringify({
                    version,
                    current_connections: peersCount,
                    compression_enabled: compressionEnabled,
                    memory: process.memoryUsage(),
                }));
        },
    ).get(
        "/count",
        (response: HttpResponse, request: HttpRequest) => {
            debugRequest(server, request);
            response.
            writeHeader("Access-Control-Allow-Origin", "*").
            end(signaler.peers.size.toString());
        }
    ).get(
        "/version",
        (response: HttpResponse, request: HttpRequest) => {
            debugRequest(server, request);
            let version: string | undefined = "unknown";
            if (signalerSettings) {
                version = signalerSettings.version;
            }
            response.
            writeHeader("Access-Control-Allow-Origin", "*").
            end(version);
        }
    ).any(
        "/*",
        (response: HttpResponse, request: HttpRequest) => {
            debugRequest(server, request);

            const status = "404 Not Found";
            response.writeStatus(status).end(status);
        },
    );

    return server;
}

function debugRequest(server: UWebSocketsSignal, request: HttpRequest): void {
    if (debugRequestsEnabled) {
        debugRequests(
            server.settings.server.port,
            "request method:",
            request.getMethod(),
            "url:",
            request.getUrl(),
            "query:",
            request.getQuery(),
        );
    }
}

async function run(): Promise<void> {
    try {
        await main();
    } catch (e) {
        console.error(e);
    }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();

/* Helper function for reading a posted JSON body */
function readJson(res: HttpResponse, cb: (json: any) => void, err: () => void) {
    let buffer: Uint8Array;
    /* Register data cb */
    res.onData((ab: ArrayBuffer, isLast: boolean) => {
        let chunk = Buffer.from(ab);
        if (isLast) {
            let json;
            if (buffer) {
                try {
                    json = JSON.parse(Buffer.concat([buffer, chunk]).toString());
                } catch (e) {
                    /* res.close calls onAborted */
                    res.close();
                    return;
                }
                cb(json);
            } else {
                try {
                    json = JSON.parse(chunk.toString());
                } catch (e) {
                    /* res.close calls onAborted */
                    res.close();
                    return;
                }
                cb(json);
            }
        } else {
            if (buffer) {
                buffer = Buffer.concat([buffer, chunk]);
            } else {
                buffer = Buffer.concat([chunk]);
            }
        }
    });

    /* Register error cb */
    res.onAborted(err);
}
