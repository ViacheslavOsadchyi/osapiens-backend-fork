import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DataSource } from 'typeorm';
import { Workflow } from '../models/Workflow';
import { Task } from '../models/Task';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { WorkflowStatus } from '../enums/WorkflowStatus.enum';
import { TaskType } from '../enums/TaskType.enum';

interface WorkflowStep {
    taskType: TaskType;
    stepNumber: number;
    dependsOn?: number[];
}

interface WorkflowDefinition {
    name: string;
    steps: WorkflowStep[];
}

export class WorkflowFactory {
    constructor(private dataSource: DataSource) {}

    /**
     * Creates a workflow by reading a YAML file and constructing the Workflow and Task entities.
     * @param filePath - Path to the YAML file.
     * @param clientId - Client identifier for the workflow.
     * @param geoJson - The geoJson data string for tasks (customize as needed).
     * @returns A promise that resolves to the created Workflow.
     */
    async createWorkflowFromYAML(
        filePath: string,
        clientId: string,
        geoJson: string,
    ): Promise<Workflow> {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const workflowDef = yaml.load(fileContent) as WorkflowDefinition;

        return this.dataSource.manager.transaction(async manager => {
            const workflowRepository = manager.getRepository(Workflow);
            const taskRepository = manager.getRepository(Task);

            const workflow = new Workflow();
            workflow.clientId = clientId;
            workflow.status = WorkflowStatus.Initial;

            const savedWorkflow = await workflowRepository.save(workflow);
            const tasksByStepNumber = new Map<number, Task[]>();
            const taskEntries: { step: WorkflowStep; task: Task }[] = [];

            for (const step of workflowDef.steps) {
                const task = new Task();

                task.clientId = clientId;
                task.geoJson = geoJson;
                task.status = TaskStatus.Queued;
                task.taskType = step.taskType;
                task.stepNumber = step.stepNumber;
                task.workflow = savedWorkflow;
                task.dependencies = [];

                taskEntries.push({ step, task });

                const tasksForStep = tasksByStepNumber.get(step.stepNumber) || [];
                tasksForStep.push(task);
                tasksByStepNumber.set(step.stepNumber, tasksForStep);
            }

            for (const { step, task } of taskEntries) {
                task.dependencies = (step.dependsOn || []).flatMap(dependencyStepNumber => {
                    const dependencyTasks = tasksByStepNumber.get(dependencyStepNumber);

                    if (!dependencyTasks) {
                        throw new Error(
                            `Unknown dependency step "${dependencyStepNumber}" for workflow step "${step.stepNumber}"`,
                        );
                    }

                    return dependencyTasks;
                });
            }

            await taskRepository.save(taskEntries.map(({ task }) => task));

            return savedWorkflow;
        });
    }
}