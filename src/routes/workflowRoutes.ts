import { Request, Response, Router } from 'express';
import { AppDataSource } from '../data-source';
import { WorkflowService } from '../services/WorkflowService';

type WorkflowParams = {
    id: string;
};

const router = Router();
const workflowService = new WorkflowService(AppDataSource);

router.get(
    // This route returns the workflow resource state, so "/workflows/:id" looks cleaner and more REST-friendly than "/workflow/:id/status".
    '/:id',
    async (req: Request<WorkflowParams>, res: Response): Promise<void> => {
        const workflowStatus = await workflowService.getWorkflowStatus(req.params.id);

        if (!workflowStatus) {
            res.status(404).json({
                message: 'Workflow not found',
            });
            return;
        }

        res.json(workflowStatus);
    },
);

router.get(
    '/:id/results',
    async (req: Request<WorkflowParams>, res: Response): Promise<void> => {
        const workflowResults = await workflowService.getWorkflowResults(req.params.id);

        if (!workflowResults) {
            res.status(404).json({
                message: 'Workflow not found',
            });
            return;
        }

        if (workflowResults.finalResult === null) {
            // 202 is used because the request is valid and the workflow exists,
            // but asynchronous processing has not produced final results yet.
            // This signals that the client may retry the request later, whereas 400 Bad Request is more likely to be treated as non-retriable.
            res.status(202).json({
                workflowId: workflowResults.workflowId,
                status: workflowResults.status,
                message: 'Workflow results are not available yet',
            });
            return;
        }

        res.json(workflowResults);
    },
);

export default router;