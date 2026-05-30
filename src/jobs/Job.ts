import { Task } from '../models/Task';

export interface Job {
    run(task: Task, dependencyOutputs?: Record<string, unknown>): Promise<unknown>;
}