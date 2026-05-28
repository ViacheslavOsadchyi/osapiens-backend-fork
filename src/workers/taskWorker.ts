import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { TaskRunner } from './taskRunner';
import { TaskStatus } from '../enums/TaskStatus.enum';

export async function taskWorker() {
    const taskRepository = AppDataSource.getRepository(Task);
    const taskRunner = new TaskRunner(taskRepository);

    while (true) {
        const queuedTask = await taskRepository.findOne({
            where: { status: TaskStatus.Queued },
            relations: ['workflow'], // Ensure workflow is loaded
        });

        if (queuedTask) {
            // Claim the task with an atomic conditional update.
            // This keeps the worker SQLite-compatible
            // For the databases that support SELECT FOR UPDATE / pessimistic locks I would use use a transaction around it
            const claimResult = await taskRepository.update(
                {
                    taskId: queuedTask.taskId,
                    status: TaskStatus.Queued,
                },
                {
                    status: TaskStatus.InProgress,
                    progress: 'starting job...',
                },
            );

            if (claimResult.affected === 1) {
                const claimedTask = await taskRepository.findOne({
                    where: { taskId: queuedTask.taskId },
                    relations: ['workflow'],
                });

                if (claimedTask) {
                    try {
                        await taskRunner.run(claimedTask);
                    } catch (error) {
                        console.error(`Task ${queuedTask.taskId} processing failed.`, error);
                    }
                }
            } else {
                console.info(`Task ${queuedTask.taskId} was claimed by another worker.`);
            }
        }

        // Wait before checking for the next task again
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
}
