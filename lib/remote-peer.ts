import { PeerContext } from "./signaling";
import fetch from 'node-fetch';

export default class RemotePeer implements PeerContext {
    public readonly id: string;
    public readonly local: boolean;
    public readonly host: string;
    public constructor(host: string, id: string) {
        this.id = id;
        this.local = false;
        this.host = host;
    }

    public async sendMessage(json: object, peer: PeerContext, localHost?: string) {
        // console.log(`sendMessage to ${peer.id} host ${localHost}`);
        let address = `http://${this.host}/cluster?action=peer_message&host=${localHost}`;
        try {
            await fetch(address, {
                method: 'POST',
                timeout: 2000,
                body: JSON.stringify(json),
            });
            // console.log(`${ address} statusCode ${response.status}`);
            // if (response.status) {
            //
            // }
        } catch (e) {
            console.error(`RemotePeer sendMessage err ${e}`);

        }
    }
}
