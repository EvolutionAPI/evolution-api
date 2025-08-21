import { Logger } from '@config/logger.config';
import { BaileysEventMap, MessageUpsertType, proto } from 'baileys';
import { catchError, concatMap, delay, EMPTY, from, retryWhen, Subject, Subscription, take, tap } from 'rxjs';

// Log de teste que confirma que o arquivo foi carregado
require('fs').writeFileSync('/tmp/debug.log', `🧪 [TESTE] ARQUIVO CARREGADO - BaileysMessageProcessor - ${new Date().toISOString()}\n`, { flag: 'a' });

type MessageUpsertPayload = BaileysEventMap['messages.upsert'];
type MountProps = {
  onMessageReceive: (payload: MessageUpsertPayload, settings: any) => Promise<void>;
};

export class BaileysMessageProcessor {
  private processorLogs = new Logger('BaileysMessageProcessor');
  private subscription?: Subscription;

  protected messageSubject = new Subject<{
    messages: proto.IWebMessageInfo[];
    type: MessageUpsertType;
    requestId?: string;
    settings: any;
  }>();

  mount({ onMessageReceive }: MountProps) {
    // Log que não é sobrescrito - escreve em arquivo
    require('fs').writeFileSync('/tmp/debug.log', `🧪 [TESTE] mount chamado - ${new Date().toISOString()}\n`, { flag: 'a' });
    this.processorLogs.log(`🧪 [TESTE] mount chamado - BaileysMessageProcessor inicializado`);
    this.subscription = this.messageSubject
      .pipe(
        tap(({ messages }) => {
          // Log que não é sobrescrito - escreve em arquivo
          require('fs').writeFileSync('/tmp/debug.log', `🚀 [BaileysMessageProcessor] Processing batch of ${messages.length} messages - ${new Date().toISOString()}\n`, { flag: 'a' });
          this.processorLogs.log(`🚀 [BaileysMessageProcessor] Processing batch of ${messages.length} messages`);
          this.processorLogs.log(`🧪 [TESTE] LOG DE TESTE FUNCIONANDO - ${new Date().toISOString()}`);
          messages.forEach((msg, index) => {
            this.processorLogs.log(`📱 [BaileysMessageProcessor] Message ${index + 1}: ${msg.key?.remoteJid} - ${msg.message?.conversation || msg.message?.extendedTextMessage?.text || 'NO_TEXT'}`);
          });
        }),
        concatMap(({ messages, type, requestId, settings }) =>
          from(onMessageReceive({ messages, type, requestId }, settings)).pipe(
            retryWhen((errors) =>
              errors.pipe(
                tap((error) => this.processorLogs.warn(`Retrying message batch due to error: ${error.message}`)),
                delay(1000), // 1 segundo de delay
                take(3), // Máximo 3 tentativas
              ),
            ),
          ),
        ),
        catchError((error) => {
          this.processorLogs.error(`Error processing message batch: ${error}`);
          return EMPTY;
        }),
      )
      .subscribe({
        error: (error) => {
          this.processorLogs.error(`Message stream error: ${error}`);
        },
      });
  }

  processMessage(payload: MessageUpsertPayload, settings: any) {
    const { messages, type, requestId } = payload;
    // Log que não é sobrescrito - escreve em arquivo
    require('fs').writeFileSync('/tmp/debug.log', `🧪 [TESTE] processMessage chamado - messages: ${messages.length}, type: ${type} - ${new Date().toISOString()}\n`, { flag: 'a' });
    this.processorLogs.log(`🧪 [TESTE] processMessage chamado - messages: ${messages.length}, type: ${type}`);
    this.messageSubject.next({ messages, type, requestId, settings });
  }

  onDestroy() {
    this.subscription?.unsubscribe();
    this.messageSubject.complete();
  }
}
