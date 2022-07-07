import { NS } from "@ns";
import { NukeServer } from "/utils/AutoNuke";

class ServerInfo {
    constructor(value: number, server: string) {
        this.value = value;
        this.server = server;
    }
    value;
    server;
    extra = "?";
}

enum HackType {
    GROW = 0,
    WEAK = 1,
    HACK = 2,
}

/** @param {NS} ns**/
export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");

    //Welcome to the Auto Farm part 2: Electric Boogaloo - Advanced Edition
    //This script is a little more complicated to explain easily, it dedicates high RAM servers to attack high profit servers
    //This is also set and forget, your EXEs and hacking level are reacquired each second, so new servers are added without needing to reboot it
    //Well I hope this brings you ideas, knowledge and or profits :D

    const growScript = "grow.js";
    const weakScript = "weak.js";
    const hackScript = "hack.js";
    const files = [growScript, weakScript, hackScript];

    await ns.write(growScript, "export async function main(ns) {await ns.grow(ns.args[0])}", "w");
    await ns.write(weakScript, "export async function main(ns) {await ns.weaken(ns.args[0])}", "w");
    await ns.write(hackScript, "export async function main(ns) {await ns.hack(ns.args[0])}", "w");

    const exclude = [""]; //Servers names that won't be used as hosts or deleted

    let servers;
    let hosts: ServerInfo[];
    let targets: ServerInfo[];
    let exes: string[];
    let tarIndex: number;
    let loop: boolean;
    let hType: HackType;
    let tmp;
    const cycle = ["▄", "█", "▀", "█"];
    let cycleI = 0;

    function checkMoney(cost: number, d: number): boolean {
        return cost < ns.getPlayer().money / d;
    }
    const ValueServerPairSort = (arr: ServerInfo[]) => arr.sort((a, b) => b.value - a.value);
    function str(s: string) {
        if (s.length > 14) {
            return s.substring(0, 14) + "...";
        } else {
            return s;
        }
    }
    function info(infoType: string, serverName: string): number {
        if (infoType == "MM") {
            return ns.getServerMaxMoney(serverName);
        }
        if (infoType == "MA") {
            return ns.getServerMoneyAvailable(serverName);
        }
        if (infoType == "MR") {
            return ns.getServerMaxRam(serverName);
        }
        if (infoType == "UR") {
            return ns.getServerUsedRam(serverName);
        }
        if (infoType == "NPR") {
            return ns.getServerNumPortsRequired(serverName);
        }
        if (infoType == "RHL") {
            return ns.getServerRequiredHackingLevel(serverName);
        }
        if (infoType == "SL") {
            return ns.getServerSecurityLevel(serverName);
        }
        if (infoType == "MSL") {
            return ns.getServerMinSecurityLevel(serverName);
        }
        return -1;
    }

    async function scanExes() {
        for (const hack of ["brutessh", "ftpcrack", "relaysmtp", "sqlinject", "httpworm"]) {
            if (ns.fileExists(hack + ".exe")) {
                exes.push(hack);
            }
        }
    }

    function log() {
        cycleI = ++cycleI % cycle.length;
        ns.print("╔═══╦════════════════════════════════════╗");
        tmp = targets.slice(0, 12);
        ns.print(`║ ${cycle[cycleI]} ║ HIGH PROFIT            BALANCE     ║`);
        for (const t of tmp) {
            ns.print(
                `║ ${t.extra} ║ ${str(t.server)}` +
                    `${ns.nFormat(info("MA", t.server), "0a")} / ${ns.nFormat(info("MM", t.server), "0a")} : ${ns.nFormat(
                        info("MA", t.server) / info("MM", t.server),
                        "0%"
                    )} ║`.padStart(36 - str(t.server).length)
            );
        }
        ns.print("╠═══╩════════════════════════════════════╝");
        ns.print(`║ EXE ${exes.length}/5 ║ HOSTS ${hosts.length} ║ TARGETS ${targets.length}`);
        ns.print("╠═════════════════════════════════════════");

        tmp = "║ MANAGER";
        tmp += " ║ P-Servers " + ns.getPurchasedServers().length;
        ns.print(tmp + "\n╠═════════════════════════════════════════");
    }

    function GetServerHackingMoneyPerTime(serverName: string) {
        const server = ns.getServer(serverName);
        const maxMoney = server.moneyMax;
        let hackTime = ns.getHackTime(server.hostname);
        if (ns.fileExists("formulas.exe")) {
            const serverCopy = ns.getServer(server.hostname);
            serverCopy.hackDifficulty = serverCopy.minDifficulty;
            hackTime = ns.formulas.hacking.hackTime(serverCopy, ns.getPlayer());
        }
        const hackChance = ns.hackAnalyzeChance(server.hostname);
        const moneyPerTime = (maxMoney / hackTime) * hackChance;

        return moneyPerTime;
    }

    async function scanServers(host: string, current: string) {
        //Combined scan and check
        const purchasedServers = ns.getPurchasedServers();
        for (const server of ns.scan(current)) {
            if ((purchasedServers.includes(server) || info("NPR", server) <= exes.length) && host != server) {
                if (!purchasedServers.includes(server) && !ns.hasRootAccess(server)) {
                    NukeServer(server, ns);
                }
                const hasRoot = ns.hasRootAccess(server);
                if (info("MM", server) != 0 && info("RHL", server) <= ns.getHackingLevel() && info("MSL", server) < 100 && hasRoot) {
                    targets.push(new ServerInfo(GetServerHackingMoneyPerTime(server), server));
                    targets = ValueServerPairSort(targets);
                }
                if (info("MR", server) > 4 && !exclude.includes(server) && hasRoot) {
                    hosts.push(new ServerInfo(info("MR", server), server));
                    hosts = ValueServerPairSort(hosts);
                }
                servers.push(server);
                for (const file of files) {
                    if (!ns.fileExists(file, server)) {
                        await ns.scp(file, "home", server);
                    }
                }
                await scanServers(current, server);
            }
        }
    }

    function freeRam(server: string) {
        return info("MR", server) - info("UR", server);
    }

    async function hackAll() {
        //Dedicates high RAM servers to high value ones
        for (const host of hosts) {
            if (tarIndex > targets.length - 1) {
                tarIndex = 0;
                loop = true;
            }
            const target = targets[tarIndex].server;

            if (info("MA", target) < info("MM", target) * 0.8) {
                hType = HackType.GROW;
            } else if (info("SL", target) > info("MSL", target) + 5 || loop) {
                hType = HackType.WEAK;
                if (freeRam(host.server) / info("MR", host.server) > 0.13 && freeRam(host.server) > 4) {
                    tmp = Math.floor(freeRam(host.server) / 1.75);
                    if (tmp > 0) {
                        ns.exec(weakScript, host.server, tmp, target);
                    }
                }
            } else {
                hType = HackType.HACK;
                for (const host of hosts) {
                    if (ns.isRunning(hackScript, host.server, target) && host.server != host.server) {
                        hType = HackType.GROW;
                        break;
                    }
                }
                if (hType == HackType.HACK && !ns.scriptRunning(hackScript, host.server)) {
                    if (freeRam(host.server) < 2) {
                        ns.tprint(`kill all on ${host.server}`);
                        ns.killall(host.server);
                    }
                    tmp = [1, Math.floor(freeRam(host.server) / 1.7)];

                    while (ns.hackAnalyze(target) * tmp[0] < 0.7 && tmp[0] < tmp[1]) {
                        tmp[0]++;
                    }
                    //ns.tprint(`Starting hacking against ${target} from ${host.server} with ${tmp[0]} threads`);
                    if (ns.exec(hackScript, host.server, tmp[0], target) == 0) {
                        ns.tprint("Failed");
                    }
                }
            }
            if ((hType == HackType.GROW || hType == HackType.HACK) && freeRam(host.server) > 3.9) {
                tmp = [Math.ceil((info("MR", host.server) / 1.75) * 0.14), Math.floor((info("MR", host.server) / 1.75) * 0.79)];
                if (tmp[1] > 0 && freeRam(host.server) / info("MR", host.server) >= 0.8) {
                    ns.exec(growScript, host.server, tmp[1], target);
                }
                if (tmp[0] > 0 && freeRam(host.server) / info("MR", host.server) >= 0.15) {
                    ns.exec(weakScript, host.server, tmp[0], target);
                }
            }
            if (!loop) {
                if (hType == HackType.GROW) {
                    targets[tarIndex].extra = "G";
                }
                if (hType == HackType.WEAK) {
                    targets[tarIndex].extra = "W";
                }
                if (hType == HackType.HACK) {
                    targets[tarIndex].extra = "H";
                }
            }
            tarIndex++;
        }
    }

    async function pServerManager() {
        let ram = 0;
        const ramList = [8];
        for (const num of ramList) {
            if (num <= 1048576 && checkMoney(ns.getPurchasedServerCost(num), 20)) {
                ramList.push(num * 2);
                ram = num;
            } else {
                break;
            }
        }
        function buyServer(r: number) {
            ns.purchaseServer("SERVER-" + ns.nFormat(r * 1000000000, "0.0b"), r);
        }
        if (ns.getPurchasedServers().length < 25 && ram > 0) {
            buyServer(ram);
        }
        for (let i = ns.getPurchasedServers().length - 1; i >= 0; i--) {
            tmp = ns.getPurchasedServers()[i];
            if (info("MR", tmp) < ram && checkMoney(ns.getPurchasedServerCost(ram), 20) && !exclude.includes(tmp)) {
                ns.killall(tmp);
                ns.deleteServer(tmp);
                buyServer(ram);
            }
        }
    }
    //MODULES ABOVE HERE
    ns.tail();
    while (true) {
        //Keeps everything running once per second
        ns.clearLog();
        servers = [];
        targets = [];
        hosts = [new ServerInfo(Math.max(info("MR", "home") - 50, 0), "home")];
        exes = [];
        tarIndex = 0;
        loop = false;
        const t0 = performance.now();
        await scanExes();
        const t1 = performance.now();
        await scanServers("", "home");
        if (targets.length > 25) {
            targets = targets.slice(0, 25);
        }
        const t2 = performance.now();
        await hackAll();
        const t3 = performance.now();
        await pServerManager();
        const t4 = performance.now();
        log();
        const t5 = performance.now();
        ns.print(`ScanExes ${t1 - t0} ms`);
        ns.print(`ScanServers ${t2 - t1} ms`);
        ns.print(`HackAll ${t3 - t2} ms`);
        ns.print(`ServerManager ${t4 - t3} ms`);
        ns.print(`Log ${t5 - t4} ms`);

        await ns.asleep(500);
    }
}
