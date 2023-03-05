"use strict";
/* eslint-disable camelcase */
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var _peers;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FastSignal = void 0;
const Debug = require("debug");
const signaling_1 = require("./signaling");
const remote_peer_1 = require("./remote-peer");
const events_1 = require("events");
// eslint-disable-next-line new-cap
const debug = Debug("cbsignal:fast-signaler");
const debugEnabled = debug.enabled;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const SIGNAL_VERSION = require('../package.json').version;
const MAX_NOT_FOUND_PEERS_LIMIT = 3;
const CHECK_CLIENT_INTERVAL = 15 * 60; // 单位：秒
const EXPIRE_LIMIT = 12 * 60;
class FastSignal extends events_1.EventEmitter {
    // private readonly checkPeersTimer: NodeJS.Timeout;
    constructor(settings) {
        super();
        // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
        // readonly #swarms = new Map<string, Swarm>();
        // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
        _peers.set(this, new Map());
        this.settings = Object.assign({ version: SIGNAL_VERSION }, settings);
        this.versionNum = this.getVersionNum(this.settings.version);
        setInterval(() => {
            const now = new Date().getTime();
            let count = 0;
            for (let [peerId, peer] of __classPrivateFieldGet(this, _peers)) {
                if (now - peer.ts > EXPIRE_LIMIT * 1000) {
                    peer.close();
                    __classPrivateFieldGet(this, _peers).delete(peerId);
                    count++;
                }
            }
            if (count > 0) {
                // eslint-disable-next-line no-console
                console.info(`check client finished, closed ${count} clients`);
            }
        }, CHECK_CLIENT_INTERVAL * 1000);
    }
    getVersionNum(ver) {
        const digs = ver.split(".");
        return Number(digs[0]) * 10 + Number(digs[1]);
    }
    get peers() {
        return __classPrivateFieldGet(this, _peers);
    }
    addRemotePeer(nodeId, peerId) {
        if (!this.host) {
            console.error(`addRemotePeer localhost is undefined`);
            return;
        }
        const remotePeer = new remote_peer_1.default(nodeId, peerId);
        __classPrivateFieldGet(this, _peers).set(peerId, remotePeer);
    }
    removeRemotePeer(peerId) {
        __classPrivateFieldGet(this, _peers).delete(peerId);
    }
    clearPeersFromNode(nodeId) {
        for (let [peerId, peer] of __classPrivateFieldGet(this, _peers)) {
            if (peer.remote && peer.host === nodeId) {
                __classPrivateFieldGet(this, _peers).delete(peerId);
                if (debugEnabled) {
                    debug(`delete remote peer ${peerId}`);
                }
            }
        }
    }
    processJoin(peerId, peer) {
        peer.id = peerId;
        peer.ts = new Date().getTime();
        __classPrivateFieldGet(this, _peers).set(peerId, peer);
        peer.sendMessage({
            action: "ver",
            ver: this.versionNum,
        }, peer, this.host);
        this.emit('peer_join', peerId);
    }
    processMessage(jsonObject, peer) {
        const json = jsonObject;
        const action = json.action;
        if (action === "signal") {
            this.processSignal(json, peer);
        }
        else if (action === "ping") {
            this.processPing(json, peer);
        }
        else if (action === "reject") {
            this.processReject(json, peer);
        }
        else {
            throw new signaling_1.SignalError("unknown action");
        }
    }
    disconnectPeer(peer) {
        const peerId = peer.id;
        if (peerId === undefined) {
            return;
        }
        if (debugEnabled) {
            debug("disconnect peer:", peerId);
        }
        __classPrivateFieldGet(this, _peers).delete(peerId);
        peer.id = undefined;
        this.emit('peer_leave', peerId);
    }
    processSignal(json, peer) {
        const toPeerId = json.to_peer_id;
        // console.log(`processSignal toPeerId ${toPeerId}`);
        const toPeer = __classPrivateFieldGet(this, _peers).get(toPeerId);
        if (toPeer === undefined) {
            // throw new SignalError("answer: to_peer_id is not in the swarm");
            if (debugEnabled) {
                debug("peer not found", toPeerId);
            }
            if (peer.notFoundPeers === undefined) {
                peer.notFoundPeers = [];
            }
            json.from_peer_id = toPeerId;
            delete json.data;
            delete json.to_peer_id;
            if (!peer.notFoundPeers.includes(toPeerId)) {
                peer.notFoundPeers.push(toPeerId);
                if (peer.notFoundPeers.length > MAX_NOT_FOUND_PEERS_LIMIT) {
                    peer.notFoundPeers.shift();
                }
                if (!peer.remote)
                    peer.sendMessage(json, peer);
            }
        }
        else {
            if (!toPeer.remote) {
                delete json.to_peer_id;
            }
            json.from_peer_id = peer.id;
            toPeer.sendMessage(json, toPeer, this.host);
            if (debugEnabled) {
                debug(peer.id, "send signal to", toPeerId, "remote:", toPeer.remote);
            }
        }
    }
    processPing(json, peer) {
        if (debugEnabled) {
            debug("receive heartbeat from", peer.id);
        }
        peer.ts = new Date().getTime();
        json.action = "pong";
        peer.sendMessage(json, peer);
    }
    processReject(json, peer) {
        const toPeerId = json.to_peer_id;
        const toPeer = __classPrivateFieldGet(this, _peers).get(toPeerId);
        json.from_peer_id = peer.id;
        if (toPeer !== undefined && peer.id) {
            if (toPeer.notFoundPeers === undefined) {
                toPeer.notFoundPeers = [];
            }
            if (!toPeer.remote) {
                delete json.to_peer_id;
            }
            if (!toPeer.notFoundPeers.includes(peer.id)) {
                toPeer.notFoundPeers.push(peer.id);
                if (toPeer.notFoundPeers.length > MAX_NOT_FOUND_PEERS_LIMIT) {
                    toPeer.notFoundPeers.shift();
                }
                toPeer.sendMessage(json, toPeer, this.host);
            }
        }
        if (debugEnabled) {
            debug(peer.id, "send reject to", toPeerId);
        }
    }
}
exports.FastSignal = FastSignal;
_peers = new WeakMap();
