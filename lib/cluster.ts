import { ClusterSettings } from "./run-uws-signal";
import ClusterNode from './cluster-node';
import fetch from 'node-fetch';
import { FastSignal } from './fast-signal';
import * as Debug from "debug";
import { App, HttpResponse, HttpRequest, TemplatedApp} from "uWebSockets.js";

// eslint-disable-next-line new-cap
const debug = Debug("cbsignal:cluster");
const debugEnabled = debug.enabled;

const REGISTER_INTERVAL = 5000;
const PING_INTERVAL = 3000;

export default class Cluster {
    public readonly settings: ClusterSettings;
    public readonly host: string;
    public readonly nodes: Map<string, ClusterNode>;
    private signaler: FastSignal;
    readonly #app: TemplatedApp;
    public constructor(signaler: FastSignal, settings: ClusterSettings) {
        this.settings = {
            maxRetries: 5,
            ...settings,
        };
        this.signaler = signaler;
        this.host = `${this.settings.ip}:${this.settings.port}`;
        this.signaler.host = this.host;
        this.nodes = new Map<string, ClusterNode>();
        this.registerNodes();

        this.signaler.on('peer_join', peerId => {
            this.broadcastPeerJoin(peerId);
        });

        this.signaler.on('peer_leave', peerId => {
            this.broadcastPeerLeave(peerId);
        });

        this.#app = App();
        this.#app.post(
            "/cluster",
            (response: HttpResponse, request: HttpRequest) => {
                const hostName = request.getQuery('host');
                const action = request.getQuery('action');

                if (!hostName) {
                    const status = "404 Not Found";
                    response.writeStatus(status).end(status);
                    return;
                }

                if (action === 'peer_join') {
                    this.processPeerJoin(hostName, request.getQuery('peer_id'));
                    response.end();
                } else if (action === 'peer_leave') {
                    this.processPeerLeave(hostName, request.getQuery('peer_id'));
                    response.end();
                } else if (action === 'peer_message') {
                    // console.log(`receive node peer_message ${hostName}`);
                    readJson(response, (json => {
                        this.processPeerMessage(hostName, json);
                        response.end();
                    }), ()=> {
                        console.error('readJson error');
                        response.end();
                    })
                } else if (action === 'ping') {
                    // console.log(`receive node ping ${hostName}`);
                    response.end();
                } else if (action === 'register') {
                    // console.log(`receive node register ${hostName}`);
                    response.end();
                } else {
                    console.log(`unknown action ${action}`);
                    const status = "404 Not Found";
                    response.writeStatus(status).end(status);
                    return;
                }
            }
        )
    }

    public async run(): Promise<void> {
        await new Promise<void>(
            (resolve, reject) => {
                this.#app.listen(
                    this.settings.port!,
                    (token: false | object) => {
                        if (token === false) {
                            reject(new Error(
                                `failed to listen to ${this.settings.port}`,
                            ));
                        } else {
                            resolve();
                        }
                    },
                );
            },
        );
    }

    public get app(): TemplatedApp {
        return this.#app;
    }

    public processPeerMessage(host: string, json: any) {
        if (!this.nodes.has(host)) {
            if (debugEnabled) {
                debug(`node ${host} not found`);
            }
            return;
        }
        const peer = this.signaler.peers.get(json.from_peer_id);
        if (!peer) {
            if (debugEnabled) {
                debug(`remote peer ${json.from_peer_id} not found`);
            }
            return;
        }
        this.signaler.processMessage(json, peer);
    }

    public broadcastPeerJoin(peerId: string) {
        // 广播给其它node
        for (let node of this.nodes.values()) {
            node.sendMsgPeerJoin(peerId);
        }
    }

    public broadcastPeerLeave(peerId: string) {
        // 广播给其它node
        for (let node of this.nodes.values()) {
            node.sendMsgPeerLeave(peerId);
        }
    }

    public processPeerJoin(host: string, peerId: string) {
        if (!peerId) return;
        if (debugEnabled) {
            debug(`addRemotePeer ${peerId}`);
        }
        this.signaler.addRemotePeer(host, peerId);
    }

    public processPeerLeave(host: string, peerId: string) {
        if (!peerId) return;
        if (debugEnabled) {
            debug(`removeRemotePeer ${peerId}`);
        }
        this.signaler.removeRemotePeer(peerId);
    }

    private async registerNodes() {
        const { nodes } = this.settings;
        if (!nodes) return;
        for (let node of nodes) {
            if (node.enabled) {
                const host = `${node.ip}:${node.port}`;
                this.registerNode(host);
            }
        }
    }

    private addNode(nodeId: string) {
        if (this.nodes.has(nodeId)) return;
        console.log(`addNode ${nodeId}`);
        const node = new ClusterNode(nodeId, this.host);
        this.nodes.set(nodeId, node);
    }

    private deleteNode(nodeId: string) {
        if (debugEnabled) {
            debug(`deleteNode ${nodeId}`);
        }
        this.nodes.delete(nodeId);
        // clear all peers that belongs to node
        this.signaler.clearPeersFromNode(nodeId);
    }

    private async registerNode(host: string) {
        const address = `http://${host}/cluster?action=register&host=${this.host}`;
        const intervalId = setInterval(async () => {
            // console.log(`register ${address}`);
            try {
                const response = await fetch(address, {method: 'POST', timeout: 5000});
                // console.log(`${address} statusCode ${response.status}`);
                clearInterval(intervalId);
                if (response.status === 200) {
                    this.addNode(host);
                    this.startPing(host);
                }
            } catch (e) {
                console.log(`registerNode ${host} err ${e}`);

            }
        }, REGISTER_INTERVAL);
    }

    private startPing(host: string) {
        const address = `http://${host}/cluster?action=ping&host=${this.host}`;
        let count = 0;
        const intervalId = setInterval(async () => {
            debug(`ping ${host}`);
            try {
                await fetch(address, {method: 'POST', timeout: 2000});
                count = 0;
            } catch (e) {
                console.error(`ping ${host} err ${e}`);
                count ++;
                if (count >= this.settings.maxRetries!) {
                    clearInterval(intervalId);
                    this.deleteNode(host);
                    this.registerNode(host);
                }
            }
        }, PING_INTERVAL);
    }
}

/* Helper function for reading a posted JSON body */
function readJson(res: HttpResponse, cb: (json: any) => void, err: () => void) {
    let buffer: Uint8Array;
    /* Register data cb */
    res.onData((ab: ArrayBuffer, isLast: boolean) => {
        let chunk = Buffer.from(ab);
        if (isLast) {
            let json;
            if (buffer) {
                try {
                    json = JSON.parse(Buffer.concat([buffer, chunk]).toString());
                } catch (e) {
                    /* res.close calls onAborted */
                    res.close();
                    return;
                }
                cb(json);
            } else {
                try {
                    json = JSON.parse(chunk.toString());
                } catch (e) {
                    /* res.close calls onAborted */
                    res.close();
                    return;
                }
                cb(json);
            }
        } else {
            if (buffer) {
                buffer = Buffer.concat([buffer, chunk]);
            } else {
                buffer = Buffer.concat([chunk]);
            }
        }
    });

    /* Register error cb */
    res.onAborted(err);
}

