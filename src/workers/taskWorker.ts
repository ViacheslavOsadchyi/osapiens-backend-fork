import { LessThan } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { TaskRunner } from './taskRunner';
import { TaskStatus } from '../enums/TaskStatus.enum';

const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const WORKER_POLL_INTERVAL_MS = 5000;

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
        const claimableTask = claimableTasks.find(task =>
            task.dependencies.every(
                dependency => dependency.status === TaskStatus.Completed,
            ),
        );

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