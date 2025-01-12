import { Logger } from '@config/logger.config';
import { RouterBroker } from '@api/abstract/abstract.router';
import { evolutionController } from '@api/server.module';
import { ConfigService } from '@config/env.config';
import { Router, Request, Response } from 'express';

export class EvolutionRouter extends RouterBroker {
  private readonly logger = new Logger('EvolutionRouter');
  
  public readonly router: Router = Router();

  constructor(readonly configService: ConfigService) {
    super();

    // Log the initialization of the EvolutionRouter
    this.logger.debug('[EvolutionRouter] Initializing router...');

    this.router.post(
      this.routerPath('webhook/evolution', false),
      async (req: Request, res: Response) => {
        try {
          this.logger.info('[EvolutionRouter] POST /webhook/evolution route called');
          
          // Log the request body for debugging (cuidado com dados sensíveis)
          const { body } = req;
          this.logger.debug(
            `[EvolutionRouter] Received request body: ${JSON.stringify(this.sanitizeBody(body))}`
          );

          this.logger.debug('[EvolutionRouter] Calling evolutionController.receiveWebhook...');
          const response = await evolutionController.receiveWebhook(body);

          // Log the response from the controller
          this.logger.debug(
            `[EvolutionRouter] Response from evolutionController: ${JSON.stringify(response)}`
          );

          this.logger.debug('[EvolutionRouter] Returning 200 with response');
          return res.status(200).json(response);
        } catch (error: any) {
          // Log the error for debugging
          this.logger.error(`[EvolutionRouter] Error in POST /webhook/evolution: ${error.message}`);
          return res.status(500).json({
            message: 'Internal server error',
            error: error.message,
          });
        }
      }
    );
    
    this.logger.debug('[EvolutionRouter] Router setup complete');
  }

  /**
   * Filters sensitive information from the request body for safe logging.
   */
  private sanitizeBody(body: any): any {
    // Implement filtering logic to exclude sensitive data
    const sanitizedBody = { ...body };
    if (sanitizedBody.password) sanitizedBody.password = '[FILTERED]';
    if (sanitizedBody.token) sanitizedBody.token = '[FILTERED]';
    return sanitizedBody;
  }
}