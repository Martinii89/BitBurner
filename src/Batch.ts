import { NS, Server } from "@ns";
import { values } from "lodash";
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

class TimeSegment {
    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }
    start;
    end;

    intersects(other: TimeSegment): boolean {
        return !(this.end < other.start || other.end < this.start);
    }
}

class BatchSubtaskInfo {
    constructor(name: string, timeSegment: TimeSegment) {
        this.name = name;
        this.timeSegment = timeSegment;
    }
    name;
    timeSegment;
}

function BatchTarget(target: Server, hosts: Server[], ns: NS): void {
    const hackTime = ns.getHackTime(target.hostname);
    const weakenTime = ns.getWeakenTime(target.hostname);
    const growTime = ns.getWeakenTime(target.hostname);

    const now = new Date().getTime();
    const finishDelay = 100; //ms;
    // Required finish time is: hack, weaken1, grow, weaken2
    // starting order: weaken1, weaken2, grow, hack
    const weaken1StartTime = now;
    const weaken1FinishTime = weakenTime + weaken1StartTime;
    const weakenTaskInfo = new BatchSubtaskInfo("weaken", new TimeSegment(weaken1StartTime, weaken1FinishTime));
    // weaken2 is offset by 2 delays
    const weaken2FinishTime = weaken1FinishTime + 2 * finishDelay;
    const weaken2TaskInfo = new BatchSubtaskInfo("weaken2", new TimeSegment(weaken2FinishTime - weakenTime, weaken2FinishTime));
    // grow is offset by 1 delay
    const growFinishTime = weaken1FinishTime + finishDelay;
    const growTaskInfo = new BatchSubtaskInfo("grow", new TimeSegment(growFinishTime - growTime, growFinishTime));
    // hack is offset by 1 delay
    const hackFinishTime = weaken1FinishTime - finishDelay;
    const hackTaskInfo = new BatchSubtaskInfo("hack", new TimeSegment(hackFinishTime - hackTime, hackFinishTime));
    ns.tprintf("Batch timings:");
    const printBatchSubtaskInfo = (task: BatchSubtaskInfo) => {
        const begin = new Date(task.timeSegment.start);
        const end = new Date(task.timeSegment.end);
        ns.tprintf("%s: [%s.%f -> %s.%f]", task.name, begin.toLocaleTimeString(), begin.getMilliseconds(), end.toLocaleTimeString(), end.getMilliseconds());
    };

    const pMoneyStolenPerThread = ns.hackAnalyze(target.hostname);
    const pMoneyLeft = 1 - pMoneyStolenPerThread;
    const growPercentRequired = 1 / pMoneyLeft;
    const growRestorCount = ns.growthAnalyze(target.hostname, growPercentRequired);
    const securityIncrease = 0.002 + Math.ceil(growRestorCount) * 0.004;
    const weakenThreads = securityIncrease / 0.05;
    ns.tprintf("Hack: %f | GrowThreads: %f | WeakenThreads: %f", pMoneyStolenPerThread, growRestorCount, weakenThreads);

    printBatchSubtaskInfo(weakenTaskInfo);
    printBatchSubtaskInfo(weaken2TaskInfo);
    printBatchSubtaskInfo(growTaskInfo);
    printBatchSubtaskInfo(hackTaskInfo);
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

function GetServerHackingMoneyPerTime(server: Server, ns: NS): number {
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

        hackableServers.forEach((x) => {
            const value = GetServerHackingMoneyPerTime(x, ns);
            ns.tprintf(
                "%-20sValue: %-10sSecurity: %s(min:%s) Grow: %f",
                x.hostname,
                ns.nFormat(value, "0.0a"),
                x.hackDifficulty,
                x.minDifficulty,
                x.serverGrowth
            );
        });
        const bestTarget = hackableServers.reduce((a, b) => {
            const aValue = GetServerHackingMoneyPerTime(a, ns);
            const bValue = GetServerHackingMoneyPerTime(b, ns);
            return aValue > bValue ? a : b;
        });
        ns.tprintf("Best target: %s", bestTarget.hostname);
        BatchTarget(hackableServers[0], sourceServers, ns);

        break;
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
