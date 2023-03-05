/// <reference types="node" />
import { Signaling, PeerContext } from "./signaling";
import { EventEmitter } from 'events';
interface Settings {
    version: string;
}
export declare class FastSignal extends EventEmitter implements Signaling {
    #private;
    readonly settings: Settings;
    host?: string;
    private readonly versionNum;
    constructor(settings?: Partial<Settings>);
    private getVersionNum;
    get peers(): ReadonlyMap<string, PeerContext>;
    addRemotePeer(nodeId: string, peerId: string): void;
    removeRemotePeer(peerId: string): void;
    clearPeersFromNode(nodeId: string): void;
    processJoin(peerId: string, peer: PeerContext): void;
    processMessage(jsonObject: object, peer: PeerContext): void;
    disconnectPeer(peer: PeerContext): void;
    private processSignal;
    private processPing;
    private processReject;
}
export {};
