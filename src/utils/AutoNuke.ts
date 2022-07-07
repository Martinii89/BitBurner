import { NS } from "@ns";

export function NukeServer(server: string, ns: NS): boolean {
    let portsOpened = 0;
    if (ns.fileExists("brutessh.exe")) {
        ns.brutessh(server);
        portsOpened++;
    }
    if (ns.fileExists("ftpcrack.exe")) {
        ns.ftpcrack(server);
        portsOpened++;
    }
    if (ns.fileExists("relaysmtp.exe")) {
        ns.relaysmtp(server);
        portsOpened++;
    }
    if (ns.fileExists("sqlinject.exe")) {
        ns.sqlinject(server);
        portsOpened++;
    }
    if (ns.fileExists("httpworm.exe")) {
        ns.httpworm(server);
        portsOpened++;
    }
    if (ns.getServerNumPortsRequired(server) <= portsOpened) {
        ns.nuke(server);
    }

    return ns.hasRootAccess(server);
}
