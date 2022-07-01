import { NS } from "@ns";
import { FindAllServers } from "/utils/DfsScan";

export async function main(ns: NS): Promise<void> {
    const all_servers = await FindAllServers(ns);
    all_servers.forEach((x) => {
        ns.killall(x.hostname);
    });
}
