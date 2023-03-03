"use strict";
/* eslint-disable no-console */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const Debug = require("debug");
const uws_signal_1 = require("./uws-signal");
const fast_signal_1 = require("./fast-signal");
const cluster_1 = require("./cluster");
const { Certificate } = require('@fidm/x509');
const fs = require('fs');
// eslint-disable-next-line new-cap
const debugRequests = Debug("cbsignal:uws-signaler-requests");
const debugRequestsEnabled = debugRequests.enabled;
async function main() {
    let settingsFileData = undefined;
    if (process.argv.length <= 2) {
        try {
            settingsFileData = fs_1.readFileSync("config.json");
        }
        catch (e) {
            if (e.code !== "ENOENT") {
                console.error("failed to read configuration file:", e);
                return;
            }
        }
    }
    else {
        try {
            settingsFileData = fs_1.readFileSync(process.argv[2]);
        }
        catch (e) {
            console.error("failed to read configuration file:", e);
            return;
        }
    }
    let jsonSettings = undefined;
    try {
        jsonSettings = (settingsFileData === undefined)
            ? {}
            : JSON.parse(settingsFileData.toString());
    }
    catch (e) {
        console.error("failed to parse JSON configuration file:", e);
        return;
    }
    const settings = validateSettings(jsonSettings);
    if (settings === undefined) {
        return;
    }
    const signaler = new fast_signal_1.FastSignal(settings.signaler);
    try {
        await runServers(signaler, settings);
    }
    catch (e) {
        console.error("failed to start the web server:", e);
    }
}
function validateSettings(jsonSettings) {
    if ((jsonSettings.servers !== undefined) && !(jsonSettings.servers instanceof Array)) {
        console.error("failed to parse JSON configuration file: 'servers' property should be an array");
        return undefined;
    }
    const servers = [];
    if (jsonSettings.servers === undefined) {
        servers.push({});
    }
    else {
        for (const serverSettings of jsonSettings.servers) {
            if (serverSettings instanceof Object) {
                servers.push(serverSettings);
            }
            else {
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
async function runServers(signaler, settings) {
    let cluster;
    if (settings.cluster && settings.cluster.enabled && settings.cluster.ip && settings.cluster.port) {
        console.log(`cluster mode`);
        cluster = new cluster_1.default(signaler, settings.cluster);
        try {
            await cluster.run();
            console.log(`cluster listening at port ${settings.cluster.port}`);
        }
        catch (e) {
            console.error(e);
        }
    }
    const servers = [];
    const serverPromises = settings.servers.map(async (serverSettings) => {
        const server = buildServer(signaler, serverSettings, settings.websocketsAccess, signaler.settings, servers, cluster);
        servers.push(server);
        await server.run();
        console.info(`listening ${server.settings.server.port}`);
    });
    await Promise.all(serverPromises);
}
function buildServer(signaler, serverSettings, websocketsAccess, signalerSettings, servers, cluster) {
    if (!(serverSettings instanceof Object)) {
        throw Error("failed to parse JSON configuration file: 'servers' property should be an array of objects");
    }
    const server = new uws_signal_1.UWebSocketsSignal(signaler, Object.assign(Object.assign({}, serverSettings), { access: websocketsAccess }));
    server.app
        .get("/info", (response, request) => {
        debugRequest(server, request);
        const peersCount = signaler.peers.size;
        const serversStats = new Array();
        for (const serverForStats of servers) {
            const settings = serverForStats.settings;
            serversStats.push({
                server: `${settings.server.port}`,
                webSocketsCount: serverForStats.stats.webSocketsCount,
            });
        }
        let version = "unknown";
        if (signalerSettings) {
            version = signalerSettings.version;
        }
        let compressionEnabled = false;
        if (serverSettings.websockets && serverSettings.websockets.compression === true) {
            compressionEnabled = true;
        }
        // 解析pem
        let certInfo;
        if (serverSettings.server && serverSettings.server.cert_file_name) {
            var caCert = fs.readFileSync(serverSettings.server.cert_file_name);
            const issuer = Certificate.fromPEM(caCert);
            certInfo = {
                name: issuer.subject.attributes[0].value,
                expire_at: issuer.validTo,
            };
        }
        response.
            writeHeader("Content-Type", "application/json").
            writeHeader("Access-Control-Allow-Origin", "*").
            end(JSON.stringify({
            version,
            current_connections: peersCount,
            compression_enabled: compressionEnabled,
            memory: process.memoryUsage(),
            cert_info: certInfo,
        }));
    }).get("/count", (response, request) => {
        debugRequest(server, request);
        response.
            writeHeader("Access-Control-Allow-Origin", "*").
            end(signaler.peers.size.toString());
    }).get("/total_count", (response, request) => {
        debugRequest(server, request);
        response.
            writeHeader("Access-Control-Allow-Origin", "*").
            end(signaler.peers.size.toString());
    }).get("/version", (response, request) => {
        debugRequest(server, request);
        let version = "unknown";
        if (signalerSettings) {
            version = signalerSettings.version;
        }
        response.
            writeHeader("Access-Control-Allow-Origin", "*").
            end(version);
    }).any("/*", (response, request) => {
        debugRequest(server, request);
        const status = "404 Not Found";
        response.writeStatus(status).end(status);
    });
    return server;
}
function debugRequest(server, request) {
    if (debugRequestsEnabled) {
        debugRequests(server.settings.server.port, "request method:", request.getMethod(), "url:", request.getUrl(), "query:", request.getQuery());
    }
}
async function run() {
    try {
        await main();
    }
    catch (e) {
        console.error(e);
    }
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
