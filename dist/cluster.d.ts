import { ClusterSettings } from "./run-uws-signal";
import ClusterNode from './cluster-node';
import { FastSignal } from './fast-signal';
import { TemplatedApp } from "uWebSockets.js";
export default class Cluster {
    #private;
    readonly settings: ClusterSettings;
    readonly host: string;
    readonly nodes: Map<string, ClusterNode>;
    private signaler;
    constructor(signaler: FastSignal, settings: ClusterSettings);
    run(): Promise<void>;
    get app(): TemplatedApp;
    processPeerMessage(host: string, json: any): void;
    broadcastPeerJoin(peerId: string): void;
    broadcastPeerLeave(peerId: string): void;
    processPeerJoin(host: string, peerId: string): void;
    processPeerLeave(host: string, peerId: string): void;
    private registerNodes;
    private addNode;
    private deleteNode;
    private registerNode;
    private startPing;
}
