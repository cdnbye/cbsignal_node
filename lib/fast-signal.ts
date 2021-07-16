
/* eslint-disable camelcase */

import * as Debug from "debug";
import { Signaling, PeerContext, SignalError } from "./signaling";

// eslint-disable-next-line new-cap
const debug = Debug("wt-signaler:fast-signaler");
const debugEnabled = debug.enabled;

interface UnknownObject {
    [key: string]: unknown;
}

interface Settings {
    version: string;
}

export class FastSignal implements Signaling {
    public readonly settings: Settings;

    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    // readonly #swarms = new Map<string, Swarm>();
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    readonly #peers = new Map<string, PeerContext>();

    private readonly versionNum: number;

    public constructor(settings?: Partial<Settings>) {
        this.settings = {
            version: "2.3.0",
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

    public processJoin(peerId: string, peer: PeerContext): void {
        peer.id = peerId;
        const oldPeer = this.#peers.get(peerId);
        if (oldPeer !== undefined) {
            if (debugEnabled) {
                debug("oldPeer !== undefined");
            }
            this.disconnectPeer(oldPeer);
        }

        this.#peers.set(peerId, peer);

        peer.sendMessage({
            action: "ver",
            ver: this.versionNum,
        }, peer);
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
    }

    private processSignal(json: UnknownObject, peer: PeerContext): void {
        const toPeerId = json.to_peer_id as string;
        const toPeer = this.#peers.get(toPeerId);

        delete json.to_peer_id;
        if (toPeer === undefined) {
            // throw new SignalError("answer: to_peer_id is not in the swarm");
            if (debugEnabled) {
                debug(
                    "peer not found",
                    toPeerId,
                );
            }
            json.from_peer_id = toPeerId;
            delete json.data;
            peer.sendMessage(json, peer);
        } else {
            json.from_peer_id = peer.id;
            toPeer.sendMessage(json, toPeer);

            if (debugEnabled) {
                debug(
                    peer.id,
                    "send signal to",
                    toPeerId,
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
        delete json.to_peer_id;
        if (toPeer !== undefined) {
            toPeer.sendMessage(json, toPeer);
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

