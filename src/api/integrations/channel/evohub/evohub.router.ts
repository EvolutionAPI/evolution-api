import { RouterBroker } from '@api/abstract/abstract.router';
import { evoHubController } from '@api/server.module';
import { ConfigService, EvolutionHub } from '@config/env.config';
import { Router } from 'express';

/**
 * EvoHubRouter — espelha o MetaRouter: GET (verify challenge, paridade defensiva) +
 * POST (webhook). O POST valida o HMAC (`X-Hub-Signature-256` sobre o raw body) antes
 * de delegar ao parser do Meta reusado em `receiveWebhook`.
 */
export class EvoHubRouter extends RouterBroker {
  constructor(readonly configService: ConfigService) {
    super();
    this.router
      .get(this.routerPath('webhook/evohub', false), async (req, res) => {
        if (req.query['hub.verify_token'] === configService.get<EvolutionHub>('EVOLUTION_HUB').TOKEN_WEBHOOK)
          res.send(req.query['hub.challenge']);
        else res.send('Error, wrong validation token');
      })
      .post(this.routerPath('webhook/evohub', false), async (req, res) => {
        const signature = req.headers['x-hub-signature-256'] as string | undefined;
        const ok = evoHubController.verifyHmac((req as any).rawBody, signature);
        if (!ok) {
          return res.status(401).json({ error: 'invalid signature' });
        }

        const { body } = req;
        const response = await evoHubController.receiveWebhook(body);

        return res.status(200).json(response);
      });
  }

  public readonly router: Router = Router();
}
