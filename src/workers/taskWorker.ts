import { LessThan } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { TaskRunner } from './taskRunner';
import { TaskStatus } from '../enums/TaskStatus.enum';

const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const WORKER_POLL_INTERVAL_MS = 5000;

const TERMINAL_DEPENDENCY_STATUSES = [
    TaskStatus.Completed,
    TaskStatus.Failed,
    TaskStatus.Blocked,
];

const BLOCKING_DEPENDENCY_STATUSES = [
    TaskStatus.Failed,
    TaskStatus.Blocked,
];

export async function taskWorker() {
    const taskRepository = AppDataSource.getRepository(Task);
    const taskRunner = new TaskRunner(taskRepository);

    while (true) {
        const claimTimeoutDate = new Date(Date.now() - CLAIM_TIMEOUT_MS);

        const claimableTasks = await taskRepository.find({
            where: [
                { status: TaskStatus.Queued },
                {
                    status: TaskStatus.InProgress,
                    claimedAt: LessThan(claimTimeoutDate),
                },
            ],
            relations: ['workflow', 'dependencies'],
        });

        // Interdependent task handling is placed here and not in TaskRunner on purpose.
        // The worker is responsible for orchestration and polling, while TaskRunner focuses on task execution.
        let claimableTask: Task | undefined;

        for (const task of claimableTasks) {
            const blockingDependency = getBlockingDependency(task);

            // Tasks with failed or blocked dependencies are transitioned to Blocked.
            // This prevents workflows from remaining indefinitely in a non-terminal state
            // when downstream tasks can no longer be executed.
            if (blockingDependency && !task.allowFailedDependencies) {
                await taskRepository
                    .createQueryBuilder()
                    .update(Task)
                    .set({
                        status: TaskStatus.Blocked,
                        progress: null,
                        claimedAt: null,
                        error: `Task blocked because dependency ${blockingDependency.taskId} is ${blockingDependency.status}.`,
                    })
                    .where('taskId = :taskId', { taskId: task.taskId })
                    .andWhere(
                        '(status = :queuedStatus OR (status = :inProgressStatus AND claimedAt < :claimTimeoutDate))',
                        {
                            queuedStatus: TaskStatus.Queued,
                            inProgressStatus: TaskStatus.InProgress,
                            claimTimeoutDate,
                        },
                    )
                    .execute();

                continue;
            }

            // Some tasks (for example reporting or cleanup tasks) may be configured to run
            // even when dependencies fail. Such tasks become runnable once all dependencies
            // reach a terminal state.
            const dependenciesSatisfied = task.allowFailedDependencies
                ? areDependenciesTerminal(task)
                : areDependenciesCompleted(task);

            if (dependenciesSatisfied) {
                claimableTask = task;
                break;
            }
        }

        if (claimableTask) {
            const claimedAt = new Date();

            // Claim the task with an atomic conditional update.
            // This keeps the worker SQLite-compatible
            // For the databases that support SELECT FOR UPDATE / pessimistic locks I would use a transaction around it
            const claimResult = await taskRepository
                .createQueryBuilder()
                .update(Task)
                .set({
                    status: TaskStatus.InProgress,
                    progress: 'starting job...',
                    claimedAt,
                })
                .where('taskId = :taskId', { taskId: claimableTask.taskId })
                .andWhere(
                    '(status = :queuedStatus OR (status = :inProgressStatus AND claimedAt < :claimTimeoutDate))',
                    {
                        queuedStatus: TaskStatus.Queued,
                        inProgressStatus: TaskStatus.InProgress,
                        // For production databases DB time would be used
                        claimTimeoutDate,
                    },
                )
                .execute();

            if (claimResult.affected === 1) {
                const claimedTask = await taskRepository.findOne({
                    where: { taskId: claimableTask.taskId },
                    relations: ['workflow'],
                });

                if (claimedTask) {
                    try {
                        await taskRunner.run(claimedTask);
                    } catch (error) {
                        console.error(`Task ${claimableTask.taskId} processing failed.`, error);
                    }
                }
            } else {
                console.info(`Task ${claimableTask.taskId} was claimed by another worker.`);
            }
        }

        await new Promise(resolve => setTimeout(resolve, WORKER_POLL_INTERVAL_MS));
    }
}

function areDependenciesCompleted(task: Task): boolean {
    return task.dependencies.every(
        dependency => dependency.status === TaskStatus.Completed,
    );
}

function areDependenciesTerminal(task: Task): boolean {
    return task.dependencies.every(
        dependency => TERMINAL_DEPENDENCY_STATUSES.includes(dependency.status),
    );
}

function getBlockingDependency(task: Task): Task | undefined {
    return task.dependencies.find(
        dependency => BLOCKING_DEPENDENCY_STATUSES.includes(dependency.status),
    );
}