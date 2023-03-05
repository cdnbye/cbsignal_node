"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = require("node-fetch");
class ClusterNode {
    constructor(host, localHost) {
        this.host = host;
        // this.localHost = localHost;
        this.joinUri = `http://${host}/cluster?action=peer_join&host=${localHost}`;
        this.leaveUri = `http://${host}/cluster?action=peer_leave&host=${localHost}`;
    }
    async sendMsgPeerJoin(peerId) {
        // console.log(`sendMsgPeerJoin ${this.joinUri}`)
        try {
            await node_fetch_1.default(`${this.joinUri}&peer_id=${peerId}`, {
                method: 'POST',
                timeout: 5000
            });
            // console.log(`${this.joinUri} statusCode ${response.status}`);
            // if (response.status) {
            //
            // }
        }
        catch (e) {
            console.error(`${this.host} sendMsgPeerJoin err ${e}`);
        }
    }
    async sendMsgPeerLeave(peerId) {
        // console.log(`sendMsgPeerLeave ${this.host}`);
        try {
            await node_fetch_1.default(`${this.leaveUri}&peer_id=${peerId}`, {
                method: 'POST',
                timeout: 5000
            });
            // console.log(`${this.joinUri} statusCode ${response.status}`);
            // if (response.status) {
            //
            // }
        }
        catch (e) {
            console.error(`${this.host} sendMsgPeerLeave err ${e}`);
        }
    }
}
exports.default = ClusterNode;
