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

export default router;