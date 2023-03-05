export default class ClusterNode {
    private readonly host;
    private readonly joinUri;
    private readonly leaveUri;
    constructor(host: string, localHost: string);
    sendMsgPeerJoin(peerId: string): Promise<void>;
    sendMsgPeerLeave(peerId: string): Promise<void>;
}
