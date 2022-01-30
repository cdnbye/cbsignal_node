
export interface PeerContext {
    remote?: boolean;
    id?: string;
    sendMessage: (json: object, peer: PeerContext, localHost?: string) => void;
    ts: number;
    notFoundPeers?: string[];
}

export interface Signaling {
    readonly peers: ReadonlyMap<string, PeerContext>;
    // readonly swarms: ReadonlyMap<string, { peers: readonly PeerContext[] }>;
    readonly settings: object;
    processJoin: (is: string, peer: PeerContext) => void;
    processMessage: (json: object, peer: PeerContext) => void;
    disconnectPeer: (peer: PeerContext) => void;
    addRemotePeer: (nodeId: string, peerId: string) => void;
    removeRemotePeer: (peerId: string) => void;
}

export class SignalError extends Error { }
