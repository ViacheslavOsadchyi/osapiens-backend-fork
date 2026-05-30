import { AppDataSource } from '../data-source';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { Task } from '../models/Task';
import { Job } from './Job';

type ReportTask = {
    taskId: string;
    type: string;
    status: TaskStatus;
    output: unknown;
    error?: string | null;
};

type ReportGenerationJobResult = {
    workflowId: string;
    tasks: ReportTask[];
    finalReport: Record<string, unknown>;
};

const TERMINAL_TASK_STATUSES = [
    TaskStatus.Completed,
    TaskStatus.Failed,
    TaskStatus.Blocked,
];

export class ReportGenerationJob implements Job {
    async run(task: Task, dependencyOutputs?: Record<string, unknown>): Promise<ReportGenerationJobResult> {
        if (!task.workflow?.workflowId) {
            throw new Error(`Task ${task.taskId} is missing workflow relation`);
        }

        const taskRepository = AppDataSource.getRepository(Task);

        const reportTask = await taskRepository.findOne({
            where: { taskId: task.taskId },
            relations: ['workflow', 'dependencies'],
        });

        if (!reportTask) {
            throw new Error(`Report generation task ${task.taskId} was not found`);
        }

        const unfinishedDependency = reportTask.dependencies.find(
            dependency => !TERMINAL_TASK_STATUSES.includes(dependency.status),
        );

        if (unfinishedDependency) {
            throw new Error(
                `Report generation task ${task.taskId} cannot run before dependency ${unfinishedDependency.taskId} reaches terminal state`,
            );
        }

        const workflowTasks = await taskRepository.find({
            where: {
                workflow: {
                    workflowId: reportTask.workflow.workflowId,
                },
            },
            order: {
                stepNumber: 'ASC',
            },
        });

        const tasks = workflowTasks
            .filter(
                workflowTask =>
                    workflowTask.taskId !== reportTask.taskId &&
                    TERMINAL_TASK_STATUSES.includes(workflowTask.status),
            )
            .map(workflowTask => ({
                taskId: workflowTask.taskId,
                type: workflowTask.taskType,
                status: workflowTask.status,
                output: this.parseOutput(workflowTask.output),
                ...(workflowTask.error ? { error: workflowTask.error } : {}),
            }));

        return {
            workflowId: reportTask.workflow.workflowId,
            tasks,
            finalReport: this.mergeObjectOutputs(tasks),
        };
    }

    private parseOutput(output: string | null): unknown {
        if (output === null) {
            return null;
        }

        try {
            return JSON.parse(output);
        } catch {
            return output;
        }
    }

    private mergeObjectOutputs(tasks: ReportTask[]): Record<string, unknown> {
        return tasks.reduce<Record<string, unknown>>((result, task) => {
            if (this.isPlainObject(task.output)) {
                return {
                    ...result,
                    ...task.output,
                };
            }

            return result;
        }, {});
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        return (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
        );
    }
}