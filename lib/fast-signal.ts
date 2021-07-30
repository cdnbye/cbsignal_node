
/* eslint-disable camelcase */

import * as Debug from "debug";
import { Signaling, PeerContext, SignalError } from "./signaling";
import RemotePeer from './remote-peer';
import { EventEmitter } from 'events';

// eslint-disable-next-line new-cap
const debug = Debug("cbsignal:fast-signaler");
const debugEnabled = debug.enabled;

const SIGNAL_VERSION = "2.4.0";
const MAX_NOT_FOUND_PEERS_LIMIT = 3;

interface UnknownObject {
    [key: string]: unknown;
}

interface Settings {
    version: string;
}

export class FastSignal extends EventEmitter implements Signaling {
    public readonly settings: Settings;
    public host?: string;
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    // readonly #swarms = new Map<string, Swarm>();
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    readonly #peers = new Map<string, PeerContext>();

    private readonly versionNum: number;

    public constructor(settings?: Partial<Settings>) {
        super();
        this.settings = {
            version: SIGNAL_VERSION,
            ...settings,
        };

        this.versionNum = this.getVersionNum(this.settings.version);
    }

    private getVersionNum(ver: string): number {
        const digs = ver.split(".");
        return Number(digs[0])*10 + Number(digs[1]);
    }

    public get peers(): ReadonlyMap<string, PeerContext> {
        return this.#peers;
    }

    public addRemotePeer(nodeId: string, peerId: string): void {
        if (!this.host) {
            console.error(`addRemotePeer localhost is undefined`);
            return;
        }
        const remotePeer = new RemotePeer(nodeId, peerId);
        this.#peers.set(peerId, remotePeer);
    }

    public removeRemotePeer(peerId: string): void {
        this.#peers.delete(peerId);
    }

    public clearPeersFromNode(nodeId: string) {
        for (let [peerId, peer] of this.#peers) {
            if (peer.remote && (peer as RemotePeer).host === nodeId) {
                this.#peers.delete(peerId);
                if (debugEnabled) {
                    debug(`delete remote peer ${peerId}`);
                }

            }
        }
    }

    public processJoin(peerId: string, peer: PeerContext): void {
        peer.id = peerId;
        // const oldPeer = this.#peers.get(peerId);
        // if (oldPeer !== undefined) {
        //     if (debugEnabled) {
        //         debug("oldPeer !== undefined");
        //     }
        //     this.disconnectPeer(oldPeer);
        // }

        this.#peers.set(peerId, peer);

        peer.sendMessage({
            action: "ver",
            ver: this.versionNum,
        }, peer, this.host);

        this.emit('peer_join', peerId)
    }

    public processMessage(jsonObject: object, peer: PeerContext): void {
        const json = jsonObject as UnknownObject;
        const action = json.action;

        if (action === "signal") {

            this.processSignal(json, peer);

        } else if (action === "ping") {

            this.processPing(json, peer);

        } else if (action === "reject") {

            this.processReject(json, peer);

        } else {

            throw new SignalError("unknown action");

        }

    }

    public disconnectPeer(peer: PeerContext): void {
        const peerId = peer.id;
        if (peerId === undefined) {
            return;
        }

        if (debugEnabled) {
            debug("disconnect peer:", peerId);
        }

        this.#peers.delete(peerId);
        peer.id = undefined;

        this.emit('peer_leave', peerId)
    }

    private processSignal(json: UnknownObject, peer: PeerContext): void {
        const toPeerId = json.to_peer_id as string;
        // console.log(`processSignal toPeerId ${toPeerId}`);
        const toPeer = this.#peers.get(toPeerId);

        if (toPeer === undefined) {
            // throw new SignalError("answer: to_peer_id is not in the swarm");
            if (debugEnabled) {
                debug(
                    "peer not found",
                    toPeerId,
                );
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
                if (!peer.remote) peer.sendMessage(json, peer);
            }
        } else {
            if (!toPeer.remote) {
                delete json.to_peer_id;
            }
            json.from_peer_id = peer.id;
            toPeer.sendMessage(json, toPeer, this.host);

            if (debugEnabled) {
                debug(
                    peer.id,
                    "send signal to",
                    toPeerId,
                    "remote:",
                    toPeer.remote
                );
            }
        }
    }

    private processPing(json: UnknownObject, peer: PeerContext): void {
        if (debugEnabled) {
            debug(
                "receive heartbeat from",
                peer.id,
            );
        }

        peer.ts = new Date().getTime();
        json.action = "pong";
        peer.sendMessage(json, peer);
    }

    private processReject(json: UnknownObject, peer: PeerContext): void {
        const toPeerId = json.to_peer_id as string;
        const toPeer = this.#peers.get(toPeerId);
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
            debug(
                peer.id,
                "send reject to",
                toPeerId,
            );
        }
    }
}

