import { Repository } from 'typeorm';
import { Task } from '../models/Task';
import { getJobForTaskType } from '../jobs/JobFactory';
import { Workflow } from '../models/Workflow';
import { Result } from '../models/Result';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { WorkflowStatus } from '../enums/WorkflowStatus.enum';

export class PersistenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = PersistenceError.name;
    }
}

export class TaskRunner {
    constructor(private taskRepository: Repository<Task>) {}

    async run(task: Task): Promise<void> {
        const job = getJobForTaskType(task.taskType);

        try {
            console.log(`Starting job ${task.taskType} for task ${task.taskId}...`);

            const taskResult = await job.run(task);

            console.log(`Job ${task.taskType} for task ${task.taskId} completed successfully.`);

            try {
                await this.taskRepository.manager.transaction(async manager => {
                    const taskRepository = manager.getRepository(Task);
                    const resultRepository = manager.getRepository(Result);
                    const workflowRepository = manager.getRepository(Workflow);

                    const result = new Result();
                    result.taskId = task.taskId!;
                    result.data = JSON.stringify(taskResult || {});

                    const savedResult = await resultRepository.save(result);

                    task.resultId = savedResult.resultId!;
                    task.status = TaskStatus.Completed;
                    task.claimedAt = null;
                    task.progress = null;

                    await taskRepository.save(task);
                    await this.updateWorkflowStatus(task.workflow.workflowId, workflowRepository);
                });
            } catch (error) {
                if (error instanceof Error) {
                    throw new PersistenceError(error.message);
                }

                throw new PersistenceError('A non-Error value was thrown');
            }
        } catch (error) {
            if (error instanceof PersistenceError) {
                console.error(`Failed to persist successful execution result for task ${task.taskId}.`, error);
                // In production can be handled by PersistenceFailed state and specific retry behaviour

                throw error;
            } else {
                console.error(`Error running job ${task.taskType} for task ${task.taskId}:`, error);
            }

            try {
                await this.taskRepository.manager.transaction(async manager => {
                    const taskRepository = manager.getRepository(Task);
                    const workflowRepository = manager.getRepository(Workflow);

                    task.status = TaskStatus.Failed;
                    task.progress = null;
                    task.claimedAt = null;

                    await taskRepository.save(task);
                    await this.updateWorkflowStatus(task.workflow.workflowId, workflowRepository);
                });
            } catch (error) {
                console.error(`Failed to persist failure state of task ${task.taskId} processing.`, error);
                // In production can be handled by PersistenceFailed state and specific retry behaviour
            }

            throw error;
        }
    }

    private async updateWorkflowStatus(
        workflowId: string,
        workflowRepository: Repository<Workflow>,
    ): Promise<void> {
        // Some race conditions are still possible here.
        // For production databases they would be handled by SELECT FOR UPDATE, which is not supported by SQLite
        // Applying optimistic versioning would require schema changes and looks like overkill for this test task
        const currentWorkflow = await workflowRepository.findOne({
            where: { workflowId },
            relations: ['tasks'],
        });

        if (!currentWorkflow) {
            return;
        }

        const allCompleted = currentWorkflow.tasks.every(
            task => task.status === TaskStatus.Completed,
        );

        const anyFailed = currentWorkflow.tasks.some(
            task => task.status === TaskStatus.Failed,
        );

        if (anyFailed) {
            currentWorkflow.status = WorkflowStatus.Failed;
        } else if (allCompleted) {
            currentWorkflow.status = WorkflowStatus.Completed;
        } else {
            currentWorkflow.status = WorkflowStatus.InProgress;
        }

        await workflowRepository.save(currentWorkflow);
    }
}