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
const cluster_node_1 = require("./cluster-node");
const node_fetch_1 = require("node-fetch");
const Debug = require("debug");
const uWebSockets_js_1 = require("uWebSockets.js");
// eslint-disable-next-line new-cap
const debug = Debug("cbsignal:cluster");
const debugEnabled = debug.enabled;
const REGISTER_INTERVAL = 5000;
const PING_INTERVAL = 3000;
class Cluster {
    constructor(signaler, settings) {
        _app.set(this, void 0);
        this.settings = Object.assign({ maxRetries: 5 }, settings);
        this.signaler = signaler;
        this.host = `${this.settings.ip}:${this.settings.port}`;
        this.signaler.host = this.host;
        this.nodes = new Map();
        this.registerNodes();
        this.signaler.on('peer_join', peerId => {
            this.broadcastPeerJoin(peerId);
        });
        this.signaler.on('peer_leave', peerId => {
            this.broadcastPeerLeave(peerId);
        });
        __classPrivateFieldSet(this, _app, uWebSockets_js_1.App());
        __classPrivateFieldGet(this, _app).post("/cluster", (response, request) => {
            const hostName = request.getQuery('host');
            const action = request.getQuery('action');
            if (!hostName) {
                const status = "404 Not Found";
                response.writeStatus(status).end(status);
                return;
            }
            if (action === 'peer_join') {
                this.processPeerJoin(hostName, request.getQuery('peer_id'));
                response.end();
            }
            else if (action === 'peer_leave') {
                this.processPeerLeave(hostName, request.getQuery('peer_id'));
                response.end();
            }
            else if (action === 'peer_message') {
                // console.log(`receive node peer_message ${hostName}`);
                readJson(response, (json => {
                    this.processPeerMessage(hostName, json);
                    response.end();
                }), () => {
                    console.error('readJson error');
                    response.end();
                });
            }
            else if (action === 'ping') {
                // console.log(`receive node ping ${hostName}`);
                response.end();
            }
            else if (action === 'register') {
                // console.log(`receive node register ${hostName}`);
                response.end();
            }
            else {
                console.log(`unknown action ${action}`);
                const status = "404 Not Found";
                response.writeStatus(status).end(status);
                return;
            }
        });
    }
    async run() {
        await new Promise((resolve, reject) => {
            __classPrivateFieldGet(this, _app).listen(this.settings.port, (token) => {
                if (token === false) {
                    reject(new Error(`failed to listen to ${this.settings.port}`));
                }
                else {
                    resolve();
                }
            });
        });
    }
    get app() {
        return __classPrivateFieldGet(this, _app);
    }
    processPeerMessage(host, json) {
        if (!this.nodes.has(host)) {
            if (debugEnabled) {
                debug(`node ${host} not found`);
            }
            return;
        }
        const peer = this.signaler.peers.get(json.from_peer_id);
        if (!peer) {
            if (debugEnabled) {
                debug(`remote peer ${json.from_peer_id} not found`);
            }
            return;
        }
        this.signaler.processMessage(json, peer);
    }
    broadcastPeerJoin(peerId) {
        // 广播给其它node
        for (let node of this.nodes.values()) {
            node.sendMsgPeerJoin(peerId);
        }
    }
    broadcastPeerLeave(peerId) {
        // 广播给其它node
        for (let node of this.nodes.values()) {
            node.sendMsgPeerLeave(peerId);
        }
    }
    processPeerJoin(host, peerId) {
        if (!peerId)
            return;
        if (debugEnabled) {
            debug(`addRemotePeer ${peerId}`);
        }
        this.signaler.addRemotePeer(host, peerId);
    }
    processPeerLeave(host, peerId) {
        if (!peerId)
            return;
        if (debugEnabled) {
            debug(`removeRemotePeer ${peerId}`);
        }
        this.signaler.removeRemotePeer(peerId);
    }
    async registerNodes() {
        const { nodes } = this.settings;
        if (!nodes)
            return;
        for (let node of nodes) {
            if (node.enabled) {
                const host = `${node.ip}:${node.port}`;
                this.registerNode(host);
            }
        }
    }
    addNode(nodeId) {
        if (this.nodes.has(nodeId))
            return;
        console.log(`addNode ${nodeId}`);
        const node = new cluster_node_1.default(nodeId, this.host);
        this.nodes.set(nodeId, node);
    }
    deleteNode(nodeId) {
        if (debugEnabled) {
            debug(`deleteNode ${nodeId}`);
        }
        this.nodes.delete(nodeId);
        // clear all peers that belongs to node
        this.signaler.clearPeersFromNode(nodeId);
    }
    async registerNode(host) {
        const address = `http://${host}/cluster?action=register&host=${this.host}`;
        const intervalId = setInterval(async () => {
            // console.log(`register ${address}`);
            try {
                const response = await node_fetch_1.default(address, { method: 'POST', timeout: 5000 });
                // console.log(`${address} statusCode ${response.status}`);
                clearInterval(intervalId);
                if (response.status === 200) {
                    this.addNode(host);
                    this.startPing(host);
                }
            }
            catch (e) {
                console.log(`registerNode ${host} err ${e}`);
            }
        }, REGISTER_INTERVAL);
    }
    startPing(host) {
        const address = `http://${host}/cluster?action=ping&host=${this.host}`;
        let count = 0;
        const intervalId = setInterval(async () => {
            debug(`ping ${host}`);
            try {
                await node_fetch_1.default(address, { method: 'POST', timeout: 2000 });
                count = 0;
            }
            catch (e) {
                console.error(`ping ${host} err ${e}`);
                count++;
                if (count >= this.settings.maxRetries) {
                    clearInterval(intervalId);
                    this.deleteNode(host);
                    this.registerNode(host);
                }
            }
        }, PING_INTERVAL);
    }
}
exports.default = Cluster;
_app = new WeakMap();
/* Helper function for reading a posted JSON body */
function readJson(res, cb, err) {
    let buffer;
    /* Register data cb */
    res.onData((ab, isLast) => {
        let chunk = Buffer.from(ab);
        if (isLast) {
            let json;
            if (buffer) {
                try {
                    json = JSON.parse(Buffer.concat([buffer, chunk]).toString());
                }
                catch (e) {
                    /* res.close calls onAborted */
                    res.close();
                    return;
                }
                cb(json);
            }
            else {
                try {
                    json = JSON.parse(chunk.toString());
                }
                catch (e) {
                    /* res.close calls onAborted */
                    res.close();
                    return;
                }
                cb(json);
            }
        }
        else {
            if (buffer) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            else {
                buffer = Buffer.concat([chunk]);
            }
        }
    });
    /* Register error cb */
    res.onAborted(err);
}
