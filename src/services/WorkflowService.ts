import { DataSource } from 'typeorm';
import { Workflow } from '../models/Workflow';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { WorkflowStatus } from '../enums/WorkflowStatus.enum';

export type WorkflowStatusDto = {
    workflowId: string;
    status: WorkflowStatus;
    completedTasks: number;
    totalTasks: number;
};

export type WorkflowTaskResultDto = {
    taskId: string;
    taskType: string;
    status: TaskStatus;
    output: unknown;
    error: string | null;
};

export type WorkflowFinalResultDto = {
    tasks: WorkflowTaskResultDto[];
};

export type WorkflowResultsDto = {
    workflowId: string;
    status: WorkflowStatus;
    finalResult: WorkflowFinalResultDto | null;
};

export class WorkflowService {
    constructor(private readonly dataSource: DataSource) {}

    async getWorkflowStatus(
        workflowId: string,
    ): Promise<WorkflowStatusDto | null> {
        const workflowRepository = this.dataSource.getRepository(Workflow);

        const workflow = await workflowRepository.findOne({
            where: { workflowId },
            relations: ['tasks'],
        });

        if (!workflow) {
            return null;
        }

        const completedTasks = workflow.tasks.filter(
            task => task.status === TaskStatus.Completed,
        ).length;

        return {
            workflowId: workflow.workflowId,
            status: workflow.status,
            completedTasks,
            totalTasks: workflow.tasks.length,
        };
    }

    async getWorkflowResults(
        workflowId: string,
    ): Promise<WorkflowResultsDto | null> {
        const workflowRepository = this.dataSource.getRepository(Workflow);

        const workflow = await workflowRepository.findOne({
            where: { workflowId },
        });

        if (!workflow) {
            return null;
        }

        if (!workflow.finalResult) {
            return {
                workflowId: workflow.workflowId,
                status: workflow.status,
                finalResult: null,
            };
        }

        return {
            workflowId: workflow.workflowId,
            status: workflow.status,
            finalResult: this.parseFinalResult(workflow.finalResult),
        };
    }

    private parseFinalResult(finalResult: string): WorkflowFinalResultDto {
        try {
            return JSON.parse(finalResult) as WorkflowFinalResultDto;
        } catch {
            return finalResult as unknown as WorkflowFinalResultDto;
        }
    }
}