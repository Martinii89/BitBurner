import { NS, Server } from "@ns";
import { values } from "lodash";
import { FindAllServers } from "/utils/DfsScan";

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

class BatchTask {
    constructor(source: string, target: string, weaken1: BatchSubtaskInfo, weaken2: BatchSubtaskInfo, hack: BatchSubtaskInfo, grow: BatchSubtaskInfo) {
        this.source = source;
        this.target = target;
        this.weaken1 = weaken1;
        this.weaken2 = weaken2;
        this.hack = hack;
        this.grow = grow;
    }

    source;
    target;
    weaken1;
    weaken2;
    hack;
    grow;
}

async function BatchTarget(target: Server, host: Server, ns: NS): Promise<BatchTask> {
    const hackScript = "/utils/hack.js";
    const growScript = "/utils/grow.js";
    const weaken1Script = "/utils/weaken1.js";
    const weaken2Script = "/utils/weaken2.js";
    await ns.scp([hackScript, growScript, weaken1Script, weaken2Script], host.hostname);

    const hackTime = ns.getHackTime(target.hostname);
    const weakenTime = ns.getWeakenTime(target.hostname);
    const growTime = ns.getGrowTime(target.hostname);

    ns.tprintf("HT: %s | WT : %s | GT: %s", ns.tFormat(hackTime), ns.tFormat(weakenTime), ns.tFormat(growTime));

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

    const hackThreads = 10;
    const pMoneyStolenPerThread = ns.hackAnalyze(target.hostname) * hackThreads;
    const pMoneyLeft = 1 - pMoneyStolenPerThread;
    const growPercentRequired = 1 / pMoneyLeft;
    const growThreads = ns.growthAnalyze(target.hostname, growPercentRequired);
    const hackSecurityIncrease = 0.002 * hackThreads;
    const growSecurityIncrease = Math.ceil(growThreads) * 0.004;
    const weaken1Threads = Math.ceil(hackSecurityIncrease / 0.05);
    const weaken2Threads = Math.ceil(growSecurityIncrease / 0.05);
    const weakenThreads = weaken1Threads + weaken2Threads;
    const totalThreads = Math.ceil(growThreads) + Math.ceil(weakenThreads) + hackThreads;
    const ramRequired = 1.75 * totalThreads;
    ns.tprintf(
        "Hack: %f | GrowThreads: %f | WeakenThreads: %f | RamRequired: %sGb",
        pMoneyStolenPerThread,
        growThreads,
        weakenThreads,
        ns.nFormat(ramRequired, "0.0a")
    );

    printBatchSubtaskInfo(weakenTaskInfo);
    printBatchSubtaskInfo(weaken2TaskInfo);
    printBatchSubtaskInfo(growTaskInfo);
    printBatchSubtaskInfo(hackTaskInfo);

    ns.tprint(`Executing weaken1 from ${host.hostname} against ${target.hostname} wity ${weaken1Threads} threads`);
    if (ns.exec(weaken1Script, host.hostname, weaken1Threads, target.hostname) == 0) {
        ns.tprint("Failed to start weaken script");
    }
    let timeToSleep = weaken2TaskInfo.timeSegment.start - new Date().getTime();
    ns.tprint(`Waiting for weaken2 time ${timeToSleep}`);
    await ns.sleep(timeToSleep);

    ns.tprint(`Executing weaken2 from ${host.hostname} against ${target.hostname} wity ${weaken2Threads} threads`);
    if (ns.exec(weaken2Script, host.hostname, weaken2Threads, target.hostname) == 0) {
        ns.tprint("Failed to start weaken1 script");
    }
    timeToSleep = growTaskInfo.timeSegment.start - new Date().getTime();
    ns.tprint(`Sleeping for ${ns.tFormat(timeToSleep)} before starting grow`);
    await ns.sleep(timeToSleep);

    ns.tprint(`Executing grow from ${host.hostname} against ${target.hostname} wity ${growThreads} threads`);
    if (ns.exec(growScript, host.hostname, growThreads, target.hostname) == 0) {
        ns.tprint("Failed to start grow script");
    }
    timeToSleep = hackTaskInfo.timeSegment.start - new Date().getTime();
    ns.tprint(`Sleeping for ${ns.tFormat(timeToSleep)} before starting hack`);
    await ns.sleep(timeToSleep);

    ns.tprint(`Executing hack from ${host.hostname} against ${target.hostname} wity ${hackThreads} threads`);
    if (ns.exec(hackScript, host.hostname, hackThreads, target.hostname) == 0) {
        ns.tprint("Failed to start hack script");
    }

    return new BatchTask(host.hostname, target.hostname, weakenTaskInfo, weaken2TaskInfo, hackTaskInfo, growTaskInfo);
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
        let bestTarget = hackableServers.reduce((a, b) => {
            const aValue = GetServerHackingMoneyPerTime(a, ns);
            const bValue = GetServerHackingMoneyPerTime(b, ns);
            return aValue > bValue ? a : b;
        });
        bestTarget = ns.getServer("galactic-cyber");
        ns.tprintf("Best target: %s", bestTarget.hostname);
        await BatchTarget(bestTarget, ns.getServer("SERVER-1.0PB"), ns);
        break;
        //await WeakenAll(hackableServers, sourceServers, ns);
        //await ns.sleep(1000);
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
