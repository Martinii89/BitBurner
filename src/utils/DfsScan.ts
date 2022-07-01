import { ServerPath } from "/types/Server";
import { NS } from "@ns";

export async function FindAllServers(ns: NS): Promise<ServerPath[]> {
    const servers: ServerPath[] = [];
    const stack = [new ServerPath("home", [])];
    const visisted: string[] = [];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (visisted.includes(current.hostname)) continue;
        visisted.push(current.hostname);
        servers.push(current);
        const neighbours = ns.scan(current.hostname);
        for (const server of neighbours) {
            const newServer = new ServerPath(server, [...current.path, current.hostname]);
            stack.push(newServer);
        }
    }
    return servers;
}
