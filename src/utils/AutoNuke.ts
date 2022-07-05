import { NS } from "@ns";

export function NukeServer(server: string, ns: NS): boolean {
    let portsOpened = 0;
    if (ns.fileExists("brutessh")) {
        ns.brutessh(server);
        portsOpened++;
    }
    if (ns.fileExists("ftpcrack")) {
        ns.ftpcrack(server);
        portsOpened++;
    }
    if (ns.fileExists("relaysmtp")) {
        ns.relaysmtp(server);
        portsOpened++;
    }
    if (ns.fileExists("sqlinject")) {
        ns.sqlinject(server);
        portsOpened++;
    }
    if (ns.fileExists("httpworm")) {
        ns.httpworm(server);
        portsOpened++;
    }
    if (ns.getServerNumPortsRequired(server) <= portsOpened) {
        ns.nuke(server);
    }
    return ns.hasRootAccess(server);
}
