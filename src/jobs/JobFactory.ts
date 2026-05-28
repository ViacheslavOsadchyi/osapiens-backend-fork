import { Job } from './Job';
import { DataAnalysisJob } from './DataAnalysisJob';
import { EmailNotificationJob } from './EmailNotificationJob';
import { TaskType } from '../enums/TaskType.enum';
import { PolygonAreaJob } from './PolygonAreaJob';

const jobMap: Record<string, () => Job> = {
    [TaskType.Analysis]: () => new DataAnalysisJob(),
    [TaskType.Notification]: () => new EmailNotificationJob(),
    [TaskType.PolygonArea]: () => new PolygonAreaJob(),
};

export function getJobForTaskType(taskType: TaskType): Job {
    const jobFactory = jobMap[taskType];
    if (!jobFactory) {
        throw new Error(`No job found for task type: ${taskType}`);
    }
    return jobFactory();
}