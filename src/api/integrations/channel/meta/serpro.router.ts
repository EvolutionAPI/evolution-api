import { serproController } from '@api/server.module';
import { Router } from 'express';

const serproRouter = Router();

serproRouter.post('/webhook', async (req, res) => {
  const { body } = req;
  const response = await serproController.receiveWebhook(body);
  return res.status(200).json(response);
});

export { serproRouter };
