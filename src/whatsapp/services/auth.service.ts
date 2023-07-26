import axios from 'axios';
import { isJWT } from 'class-validator';
import { sign, verify } from 'jsonwebtoken';
import { v4 } from 'uuid';

import { name as apiName } from '../../../package.json';
import { Auth, ConfigService, Webhook } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { RepositoryBroker } from '../repository/repository.manager';
import { WAMonitoringService } from './monitor.service';

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

    this.logger.verbose('JWT token created: ' + token);

    const auth = await this.repository.auth.create({ jwt: token }, instance.instanceName);

    this.logger.verbose('JWT token saved in database');

    if (auth['error']) {
      this.logger.error({
        localError: AuthService.name + '.jwt',
        error: auth['error'],
      });
      throw new BadRequestException('Authentication error', auth['error']?.toString());
    }

    return { jwt: token };
  }

  private async apikey(instance: InstanceDto, token?: string) {
    const apikey = token ? token : v4().toUpperCase();

    this.logger.verbose(token ? 'APIKEY defined: ' + apikey : 'APIKEY created: ' + apikey);

    const auth = await this.repository.auth.create({ apikey }, instance.instanceName);

    this.logger.verbose('APIKEY saved in database');

    if (auth['error']) {
      this.logger.error({
        localError: AuthService.name + '.apikey',
        error: auth['error'],
      });
      throw new BadRequestException('Authentication error', auth['error']?.toString());
    }

    return { apikey };
  }

  public async checkDuplicateToken(token: string) {
    const instances = await this.waMonitor.instanceInfo();

    this.logger.verbose('checking duplicate token');

    const instance = instances.find((instance) => instance.instance.apikey === token);

    if (instance) {
      throw new BadRequestException('Token already exists');
    }

    this.logger.verbose('available token');

    return true;
  }

  public async generateHash(instance: InstanceDto, token?: string) {
    const options = this.configService.get<Auth>('AUTHENTICATION');

    this.logger.verbose('generating hash ' + options.TYPE + ' to instance: ' + instance.instanceName);

    return (await this[options.TYPE](instance, token)) as { jwt: string } | { apikey: string };
  }

  public async refreshToken({ oldToken }: OldToken) {
    this.logger.verbose('refreshing token');

    if (!isJWT(oldToken)) {
      throw new BadRequestException('Invalid "oldToken"');
    }

    try {
      const jwtOpts = this.configService.get<Auth>('AUTHENTICATION').JWT;

      this.logger.verbose('checking oldToken');

      const decode = verify(oldToken, jwtOpts.SECRET, {
        ignoreExpiration: true,
      }) as Pick<JwtPayload, 'apiName' | 'instanceName' | 'tokenId'>;

      this.logger.verbose('checking token in database');

      const tokenStore = await this.repository.auth.find(decode.instanceName);

      const decodeTokenStore = verify(tokenStore.jwt, jwtOpts.SECRET, {
        ignoreExpiration: true,
      }) as Pick<JwtPayload, 'apiName' | 'instanceName' | 'tokenId'>;

      this.logger.verbose('checking tokenId');

      if (decode.tokenId !== decodeTokenStore.tokenId) {
        throw new BadRequestException('Invalid "oldToken"');
      }

      this.logger.verbose('generating new token');

      const token = {
        jwt: (await this.jwt({ instanceName: decode.instanceName })).jwt,
        instanceName: decode.instanceName,
      };

      try {
        this.logger.verbose('checking webhook');
        const webhook = await this.repository.webhook.find(decode.instanceName);
        if (webhook?.enabled && this.configService.get<Webhook>('WEBHOOK').EVENTS.NEW_JWT_TOKEN) {
          this.logger.verbose('sending webhook');

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

      this.logger.verbose('token refreshed');

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
