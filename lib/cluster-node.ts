import fetch from 'node-fetch';

export default class ClusterNode {

    private readonly host: string;
    // private readonly localHost: string;
    private readonly joinUri: string;
    private readonly leaveUri: string;

    public constructor(host: string, localHost: string) {
        this.host = host;
        // this.localHost = localHost;
        this.joinUri = `http://${host}/cluster?action=peer_join&host=${localHost}`;
        this.leaveUri = `http://${host}/cluster?action=peer_leave&host=${localHost}`;
    }

    public async sendMsgPeerJoin(peerId: string) {
        // console.log(`sendMsgPeerJoin ${this.joinUri}`)
        try {
            await fetch(`${this.joinUri}&peer_id=${peerId}`, {
                method: 'POST',
                timeout: 5000
            });
            // console.log(`${this.joinUri} statusCode ${response.status}`);
            // if (response.status) {
            //
            // }
        } catch (e) {
            console.error(`${this.host} sendMsgPeerJoin err ${e}`);

        }
    }

    public async sendMsgPeerLeave(peerId: string) {
        // console.log(`sendMsgPeerLeave ${this.host}`);
        try {
            await fetch(`${this.leaveUri}&peer_id=${peerId}`, {
                method: 'POST',
                timeout: 5000
            });
            // console.log(`${this.joinUri} statusCode ${response.status}`);
            // if (response.status) {
            //
            // }
        } catch (e) {
            console.error(`${this.host} sendMsgPeerLeave err ${e}`);

        }
    }
}
