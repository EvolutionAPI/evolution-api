import { Auth, ConfigService, Webhook } from '../../config/env.config';
import { InstanceDto } from '../dto/instance.dto';
import { name as apiName } from '../../../package.json';
import { verify, sign } from 'jsonwebtoken';
import { Logger } from '../../config/logger.config';
import { v4 } from 'uuid';
import { isJWT } from 'class-validator';
import { BadRequestException } from '../../exceptions';
import axios from 'axios';
import { WAMonitoringService } from './monitor.service';
import { RepositoryBroker } from '../repository/repository.manager';

export type JwtPayload = {
  instanceName: string;
  apiName: string;
  jwt?: string;
  apikey?: string;
  tokenId: string;
};

export class OldToken {
  oldToken: string;
}

export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly waMonitor: WAMonitoringService,
    private readonly repository: RepositoryBroker,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  private async jwt(instance: InstanceDto) {
    const jwtOpts = this.configService.get<Auth>('AUTHENTICATION').JWT;
    const token = sign(
      {
        instanceName: instance.instanceName,
        apiName,
        tokenId: v4(),
      },
      jwtOpts.SECRET,
      { expiresIn: jwtOpts.EXPIRIN_IN, encoding: 'utf8', subject: 'g-t' },
    );

    const auth = await this.repository.auth.create({ jwt: token }, instance.instanceName);

    if (auth['error']) {
      this.logger.error({
        localError: AuthService.name + '.jwt',
        error: auth['error'],
      });
      throw new BadRequestException('Authentication error', auth['error']?.toString());
    }

    return { jwt: token };
  }

  private async apikey(instance: InstanceDto) {
    const apikey = v4().toUpperCase();

    const auth = await this.repository.auth.create({ apikey }, instance.instanceName);

    if (auth['error']) {
      this.logger.error({
        localError: AuthService.name + '.jwt',
        error: auth['error'],
      });
      throw new BadRequestException('Authentication error', auth['error']?.toString());
    }

    return { apikey };
  }

  public async generateHash(instance: InstanceDto) {
    const options = this.configService.get<Auth>('AUTHENTICATION');
    return (await this[options.TYPE](instance)) as { jwt: string } | { apikey: string };
  }

  public async refreshToken({ oldToken }: OldToken) {
    if (!isJWT(oldToken)) {
      throw new BadRequestException('Invalid "oldToken"');
    }

    try {
      const jwtOpts = this.configService.get<Auth>('AUTHENTICATION').JWT;
      const decode = verify(oldToken, jwtOpts.SECRET, {
        ignoreExpiration: true,
      }) as Pick<JwtPayload, 'apiName' | 'instanceName' | 'tokenId'>;

      const tokenStore = await this.repository.auth.find(decode.instanceName);

      const decodeTokenStore = verify(tokenStore.jwt, jwtOpts.SECRET, {
        ignoreExpiration: true,
      }) as Pick<JwtPayload, 'apiName' | 'instanceName' | 'tokenId'>;

      if (decode.tokenId !== decodeTokenStore.tokenId) {
        throw new BadRequestException('Invalid "oldToken"');
      }

      const token = {
        jwt: (await this.jwt({ instanceName: decode.instanceName })).jwt,
        instanceName: decode.instanceName,
      };

      try {
        const webhook = await this.repository.webhook.find(decode.instanceName);
        if (
          webhook?.enabled &&
          this.configService.get<Webhook>('WEBHOOK').EVENTS.NEW_JWT_TOKEN
        ) {
          const httpService = axios.create({ baseURL: webhook.url });
          await httpService.post(
            '',
            {
              event: 'new.jwt',
              instance: decode.instanceName,
              data: token,
            },
            { params: { owner: this.waMonitor.waInstances[decode.instanceName].wuid } },
          );
        }
      } catch (error) {
        this.logger.error(error);
      }

      return token;
    } catch (error) {
      this.logger.error({
        localError: AuthService.name + '.refreshToken',
        error,
      });
      throw new BadRequestException('Invalid "oldToken"');
    }
  }
}
