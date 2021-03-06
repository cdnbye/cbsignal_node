import { PeerContext } from "./signaling";
export default class RemotePeer implements PeerContext {
    readonly id: string;
    readonly remote: boolean;
    readonly host: string;
    readonly ts: number;
    constructor(host: string, id: string);
    sendMessage(json: object, peer: PeerContext, localHost?: string): Promise<void>;
}
