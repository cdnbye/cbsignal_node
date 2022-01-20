"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = require("node-fetch");
class RemotePeer {
    constructor(host, id) {
        this.id = id;
        this.remote = true;
        this.host = host;
    }
    async sendMessage(json, peer, localHost) {
        // console.log(`sendMessage to ${peer.id} host ${localHost}`);
        let address = `http://${this.host}/cluster?action=peer_message&host=${localHost}`;
        try {
            await node_fetch_1.default(address, {
                method: 'POST',
                timeout: 5000,
                body: JSON.stringify(json),
            });
            // console.log(`${ address} statusCode ${response.status}`);
            // if (response.status) {
            //
            // }
        }
        catch (e) {
            console.error(`RemotePeer sendMessage err ${e}`);
        }
    }
}
exports.default = RemotePeer;
