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
}