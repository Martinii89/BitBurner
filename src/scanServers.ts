import { NS } from "@ns";
import { FindAllServers } from "utils/DfsScan";

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");

    const servers = await FindAllServers(ns);
    for (const server of servers) {
        ns.tprintf("%s\n\t%s", server.hostname, server.path);
    }
}
