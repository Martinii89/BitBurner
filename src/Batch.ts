import { NS, Server } from "@ns";
import { notStrictEqual } from "assert";
import { FindAllServers } from "/utils/DfsScan";

class BatchItem {
    constructor(source: string, target: string, weaken1_finish_time: number) {
        this.source = source;
        this.target = target;
        this.weaken1_finish_time = weaken1_finish_time;
    }

    source;
    target;
    weaken1_finish_time;
}

function FindExes(ns: NS): string[] {
    const exes = [];
    for (const hack of ["brutessh", "ftpcrack", "relaysmtp", "sqlinject", "httpworm"]) {
        if (ns.fileExists(hack + ".exe")) {
            exes.push(hack);
        }
    }
    return exes;
}

function NukeServer(server: string, ns: NS) {
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
}

async function WeakenAll(targets: Server[], sources: Server[], ns: NS) {
    const weakenRamUsage = ns.getScriptRam("/utils/weaken1.js");
    targets.sort((a, b) => ns.getWeakenTime(a.hostname) - ns.getWeakenTime(b.hostname));
    for (const target of targets) {
        //ns.tprintf("Weaken time of %s is %s", target.hostname, ns.getWeakenTime(target.hostname));
        let possibleWeaken = target.hackDifficulty - target.minDifficulty;
        //ns.tprintf("Possible weaken on %s is %f", server.hostname, possibleWeaken);
        if (possibleWeaken <= 0) {
            continue;
        }
        for (const host of sources) {
            const effectPerThread = ns.weakenAnalyze(1, host.cpuCores);
            const maxThreads = Math.ceil(possibleWeaken / effectPerThread);
            //ns.tprintf("MaxThreads: %f", maxThreads);
            const threadsAvailable = Math.floor((host.maxRam - host.ramUsed) / weakenRamUsage);
            if (threadsAvailable <= 0) {
                continue;
            }
            ns.tprintf("Required Ram: %f, FreeRam: %f", weakenRamUsage, host.maxRam - host.ramUsed);
            ns.tprintf("%s: MaxThreads: %i threadsAvailable: %i", host.hostname, maxThreads, threadsAvailable);
            const threadsToUse = Math.min(maxThreads, threadsAvailable);
            const weakenResult = threadsToUse * effectPerThread;
            const started = await RunWeaken1(target.hostname, host.hostname, threadsToUse, ns);
            if (!started) {
                ns.tprintf("Failed to start Weaken1 on %s with %i threads", host.hostname, threadsToUse);
                continue;
            }
            possibleWeaken -= weakenResult;
            host.ramUsed += weakenRamUsage * threadsToUse;
            ns.tprintf(
                "Running Weaken1 on %s from %s with %i threads: Reducing security by %f (remaining %f)",
                target.hostname,
                host.hostname,
                threadsToUse,
                weakenResult,
                possibleWeaken
            );

            if (possibleWeaken <= 0) {
                break;
            }
        }
    }
}

async function RunWeaken1(target: string, host: string, threads: number, ns: NS): Promise<boolean> {
    await ns.scp("/utils/weaken1.js", host);
    const pid = ns.exec("utils/weaken1.js", host, threads, target);
    return pid != 0;
}

export async function main(ns: NS): Promise<void> {
    while (true) {
        ns.disableLog("sleep");
        const allServerPaths = await FindAllServers(ns);
        allServerPaths.forEach((server) => {
            NukeServer(server.hostname, ns);
        });
        const allServers = allServerPaths.map((x) => ns.getServer(x.hostname));
        const hackLevel = ns.getHackingLevel();
        const hackableServers = allServers.filter((x) => {
            return x.requiredHackingSkill < hackLevel && x.hasAdminRights && !x.purchasedByPlayer && x.moneyMax > 0;
        });
        const sourceServers = allServers.filter((x) => {
            return x.hasAdminRights == true;
        });

        await WeakenAll(hackableServers, sourceServers, ns);
        await ns.sleep(1000);
    }

    // ns.tprintf("HackLevel: %i ", hackLevel);
    // const now = new Date();
    // ns.tprintf("CurrentTimestamp: %i", now.getTime());

    // ns.tprintf("Hackable servers:");
    // for (const server of hackableServers) {
    //     const hackTime = ns.getHackTime(server.hostname);
    //     const maxHackMoney = ns.hackAnalyze(server.hostname) * server.moneyMax;
    //     const hackMoneyRate = (maxHackMoney / hackTime) * 1000;
    //     ns.tprintf(
    //         "%s:\n\tRam: %i, Cores: %i\n\tHackTime: %s, MoneyPerHack: %i,  Rate: %s",
    //         server.hostname,
    //         server.maxRam,
    //         server.cpuCores,
    //         ns.tFormat(hackTime),
    //         maxHackMoney,
    //         ns.nFormat(hackMoneyRate, "0.0a")
    //     );
    // }
}
