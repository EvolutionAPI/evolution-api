import { Logger } from '@config/logger.config';
import { BaileysEventMap, MessageUpsertType, proto } from 'baileys';
import { catchError, concatMap, EMPTY, from, Subject, Subscription, tap } from 'rxjs';

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
    this.subscription = this.messageSubject
      .pipe(
        tap(({ messages }) => {
          this.processorLogs.log(`Processing batch of ${messages.length} messages`);
        }),
        concatMap(({ messages, type, requestId, settings }) =>
          from(onMessageReceive({ messages, type, requestId }, settings)),
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
    this.messageSubject.next({ messages, type, requestId, settings });
  }

  onDestroy() {
    this.subscription?.unsubscribe();
    this.messageSubject.complete();
  }
}
