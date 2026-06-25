import { RouterBroker } from '@api/abstract/abstract.router';
import { authGuard } from '@api/guards/auth.guard';
import { evoHubClient, instanceController, prismaRepository } from '@api/server.module';
import { Integration } from '@api/types/wa.types';
import { ConfigService, HttpServer } from '@config/env.config';
import { RequestHandler, Router } from 'express';

/**
 * EvoHubControlPlaneRouter — rotas finas `/evohub/*` (contrato §2) que o frontend
 * (manager-v2) consome. Elas delegam ao `evoHubClient`, que fala com o hub usando a
 * EVOLUTION_HUB_API_KEY global. TODAS exigem authz admin (apikey global — `authGuard.apikey`).
 * O front NUNCA fala com o hub direto nem manuseia a API-key/channel_token.
 *
 * Fase 1: plan, meta-app-options, channels, channels/:id, available-channels,
 * link-existing. Fase 2: provision, channels/:id/meta-connect.
 */
export class EvoHubControlPlaneRouter extends RouterBroker {
  public readonly router: Router = Router();

  constructor(readonly configService: ConfigService) {
    super();

    const guard: RequestHandler = authGuard['apikey'];

    // ---- FASE 1 ----
    this.router.get('/evohub/plan', guard, async (_req, res) => {
      res.json(await evoHubClient.getPlan());
    });

    this.router.get('/evohub/meta-app-options', guard, async (_req, res) => {
      res.json(await evoHubClient.getMetaAppOptions());
    });

    this.router.get('/evohub/channels', guard, async (req, res) => {
      const type = req.query.type as 'whatsapp' | 'facebook' | 'instagram' | undefined;
      res.json(await evoHubClient.listChannels(type));
    });

    this.router.get('/evohub/channels/:id', guard, async (req, res) => {
      res.json(await evoHubClient.getChannel(req.params.id as string));
    });

    this.router.get('/evohub/available-channels', guard, async (_req, res) => {
      const channels = await evoHubClient.getAvailableChannels();

      // O evolution-api é uma API de WhatsApp — o hub (GetChannels) NÃO filtra por type
      // e devolve todos os canais do usuário (whatsapp + facebook + instagram). Expomos
      // SÓ os canais WhatsApp.
      const byType = channels.filter((c) => c.type === 'whatsapp');

      // Filtro best-effort de já-vinculados (contrato §2). A garantia DURA de
      // "um phone_number_id => no máx. uma Instance" vive na CRIAÇÃO da Instance
      // (Decisão 8 / AC15), não aqui.
      const linked = await prismaRepository.instance.findMany({
        where: { integration: Integration.EVOHUB },
        select: { number: true },
      });
      const linkedNumbers = new Set(linked.map((i) => i.number));
      res.json(
        byType.filter((c) => {
          const pn = c.meta_connection?.phone_number_id;
          return pn ? !linkedNumbers.has(pn) : true;
        }),
      );
    });

    // POST /evohub/link-existing — resolve token+phone_number_id server-side e cria Instance
    this.router.post('/evohub/link-existing', guard, async (req, res) => {
      const { hub_channel_id } = req.body as { hub_channel_id: string; channel_type?: string };

      // 1) canal COMPLETO (token + meta_connection) — server-side, front nunca vê
      const channel = await evoHubClient.getChannel(hub_channel_id);
      const token = channel.token;
      const phoneNumberId = channel.meta_connection?.phone_number_id;
      if (!token || !phoneNumberId) {
        return res.status(422).json({ error: 'hub channel missing token or phone_number_id' });
      }

      // 2) cria a Instance EVOHUB pelo caminho padrão, com o token JÁ resolvido
      //    (flui pelo channel.controller.init() guard sem relaxá-lo — contrato §5).
      const created = await instanceController.createInstance({
        instanceName: (req.body.instanceName as string) || `evohub-${phoneNumberId}`,
        integration: Integration.EVOHUB,
        number: phoneNumberId,
        token,
      });

      return res.status(201).json(created);
    });

    // POST /evohub/provision — cria canal novo no hub. Mapeia o payload do front
    // { instanceName, channel_type, meta_app_mode } para o contrato do hub { name, type,
    // channel_credentials_id?, webhook_url }. Registra o webhook do evolution-api
    // (single-shot) para receber mensagens. Devolve { channel_token, public_link,
    // hub_channel_id } — o front abre o public_link para o OAuth Meta.
    this.router.post('/evohub/provision', guard, async (req, res) => {
      const { instanceName, meta_app_mode } = req.body as {
        instanceName: string;
        meta_app_mode?: string; // "shared" | byo_credential_id
      };

      const serverUrl = configService.get<HttpServer>('SERVER').URL;
      // "shared" => sem channel_credentials_id; qualquer outro valor => BYO credential id.
      const channelCredentialsId = meta_app_mode && meta_app_mode !== 'shared' ? meta_app_mode : undefined;

      const result = await evoHubClient.provisionChannel({
        name: instanceName,
        type: 'whatsapp', // evolution-api é uma API de WhatsApp — sempre whatsapp
        channel_credentials_id: channelCredentialsId,
        webhook_url: serverUrl ? `${serverUrl}/webhook/evohub` : undefined,
      });

      res.json(result);
    });

    this.router.post('/evohub/channels/:id/meta-connect', guard, async (req, res) => {
      res.json(await evoHubClient.connectToMeta(req.params.id as string, req.body));
    });
  }
}
