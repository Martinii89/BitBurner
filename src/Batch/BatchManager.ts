import { NS, Server } from "@ns";

const hackScript = "/utils/hack.js";
const growScript = "/utils/grow.js";
const weaken1Script = "/utils/weaken1.js";
const weaken2Script = "/utils/weaken2.js";

enum BatchState {
    NONE,
    WEAKEN1,
    GROW,
    WEAKEN2,
    HACK,
    DONE,
    FAIL,
}

class BatchItem {
    target: string;
    host: string;
    endTime = 0;
    startTime = 0;
    taskSpacing;
    threads: BatchThreads;
    state = BatchState.NONE;

    constructor(target: string, host: string, taskSpacing: number, threads: BatchThreads) {
        this.target = target;
        this.host = host;
        this.taskSpacing = taskSpacing;
        this.threads = threads;
    }

    Tick(ns: NS) {
        // Required finish time is: hack, weaken1, grow, weaken2
        // starting order: weaken1, weaken2, grow, hack
        // each | represents one taskSpacing
        // hackEndTime | weaken1EndTime |  growEndTime | weaken2EndTime  | endTime
        if (this.state == BatchState.NONE) {
            this.StartWeaken1(ns);
        } else if (this.state == BatchState.WEAKEN1) {
            const weaken2FinishTime = performance.now() + ns.getWeakenTime(this.target);
        }
    }

    private StartScript(ns: NS, script: string, threads: number): number {
        const pid = ns.exec(script, this.host, threads, this.target, performance.now());
        ns.tprintf("Starting %s on %s with %i threads with target %s (pid: %i)", script, this.host, threads, this.target, pid);
        return pid;
    }

    private StartWeaken1(ns: NS) {
        const weakenTime = ns.getWeakenTime(this.target);
        this.StartScript(ns, weaken1Script, this.threads.weaken1);
        this.startTime = performance.now();
        this.endTime = this.startTime + weakenTime + this.taskSpacing * 3;
        this.state = BatchState.WEAKEN1;
    }
}

class BatchThreads {
    weaken1 = 0;
    weaken2 = 0;
    grow = 0;
    hack = 0;

    GetRamUsage(): number {
        return (this.weaken1 + this.weaken2 + this.grow + this.hack) * 1.75;
    }
}

export class BatchManager {
    target: Server;
    host: Server;
    ns: NS;
    scriptSpacing: number;
    activeBatches: BatchItem[] = [];
    previousBatchEndTime: number = performance.now();
    hackThreads = 5;

    constructor(ns: NS, target: Server, host: Server, scriptSpacing: number) {
        this.ns = ns;
        this.target = target;
        this.host = host;

        this.scriptSpacing = scriptSpacing;
    }

    GetNewBatch(): BatchItem {
        const newBatch = new BatchItem(this.target.hostname, this.host.hostname, this.scriptSpacing, this.GetBatchThreadUsage());
        return newBatch;
    }

    QueueNewBatch(batch: BatchItem): void {
        batch.Tick(this.ns);
        this.activeBatches.push(batch);
        this.previousBatchEndTime = batch.endTime;
    }

    async PrepareHost(): Promise<void> {
        this.ns.tprint("Copying hack/grow/weak scripts to host if they are missing");
        for (const file of [hackScript, growScript, weaken1Script, weaken2Script]) {
            if (this.ns.fileExists(file, this.host.hostname)) {
                continue;
            }
            await this.ns.scp(file, this.host.hostname);
        }
    }

    GetHostFreeRam(): number {
        const server = this.ns.getServer(this.host.hostname);
        return server.maxRam - server.ramUsed;
    }

    CanQueueNewBatch(): boolean {
        const weakenTime = this.GetTargetWeakTime();
        const weakenEndTime = performance.now() + weakenTime;
        if (weakenEndTime < this.previousBatchEndTime) {
            return false;
        }
        const threadUsage = this.GetBatchThreadUsage();
        const ramUsage = threadUsage.GetRamUsage();

        return ramUsage < this.GetHostFreeRam();
    }

    GetBatchThreadUsage(): BatchThreads {
        const weakenPerThread = 0.05;
        const growSecurityIncreasePerThread = 0.004;
        const hackSecurityIncreasePerThread = 0.002;

        const threadUsage = new BatchThreads();
        threadUsage.hack = this.hackThreads;
        const pMoneyStolenPerThread = this.ns.hackAnalyze(this.target.hostname) * threadUsage.hack;
        const pMoneyLeft = 1 - pMoneyStolenPerThread;
        const growPercentRequired = 1 / pMoneyLeft;
        threadUsage.grow = Math.ceil(this.ns.growthAnalyze(this.target.hostname, growPercentRequired));
        const hackSecurityIncrease = hackSecurityIncreasePerThread * threadUsage.hack;
        const growSecurityIncrease = growSecurityIncreasePerThread * threadUsage.grow;

        threadUsage.weaken1 = Math.ceil(hackSecurityIncrease / weakenPerThread);
        threadUsage.weaken2 = Math.ceil(growSecurityIncrease / weakenPerThread);
        return threadUsage;
    }

    GetTargetWeakTime(): number {
        return this.ns.getWeakenTime(this.target.hostname);
    }

    GetTargetHackTime(): number {
        return this.ns.getHackTime(this.target.hostname);
    }

    GetTargetGrowTime(): number {
        return this.ns.getGrowTime(this.target.hostname);
    }
}
