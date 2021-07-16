
export interface PeerContext {
    id?: string;
    sendMessage: (json: object, peer: PeerContext) => void;
    ts?: number;
}

export interface Signaling {
    readonly peers: ReadonlyMap<string, PeerContext>;
    // readonly swarms: ReadonlyMap<string, { peers: readonly PeerContext[] }>;
    readonly settings: object;
    processJoin: (is: string, peer: PeerContext) => void;
    processMessage: (json: object, peer: PeerContext) => void;
    disconnectPeer: (peer: PeerContext) => void;
}

export class SignalError extends Error { }
