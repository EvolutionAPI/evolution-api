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

/**
 * Represents the payload of a JWT token.
 */
export type JwtPayload = {
  instanceName: string;
  apiName: string;
  jwt?: string;
  apikey?: string;
  tokenId: string;
};

/**
 * Represents the structure of an old JWT token.
 */
export class OldToken {
  oldToken: string;
}
/**
 * Service responsible for authentication-related operations.
 */
export class AuthService {
  /**
   * Creates an instance of AuthService.
   * @param configService The configuration service.
   * @param waMonitor The monitoring service for WhatsApp instances.
   * @param repository The repository manager for database operations.
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly waMonitor: WAMonitoringService,
    private readonly repository: RepositoryBroker,
  ) { }

  private readonly logger = new Logger(AuthService.name);

  /**
   * Generates a JWT token for a given instance.
   * @param instance The instance DTO for which to generate the token.
   * @returns An object containing the generated JWT token.
   * @throws BadRequestException if an error occurs during token generation.
   */
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

  /**
     * Generates an API key for a given instance.
     * @param instance The instance DTO for which to generate the API key.
     * @param token (Optional) An existing API key to use.
     * @returns An object containing the generated or defined API key.
     * @throws BadRequestException if an error occurs during API key generation.
     */
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

  /**
   * Checks for the existence of a duplicate token among instances.
   * @param token The token to check for duplication.
   * @returns `true` if the token is not duplicated among instances, otherwise throws a BadRequestException.
   */
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

  /**
  * Generates an authentication hash (JWT token or API key) based on the authentication type.
  * @param instance The instance DTO for which to generate the hash.
  * @param token (Optional) An existing token to use (for API key generation).
  * @returns An object containing the generated authentication hash (JWT token or API key).
  */
  public async generateHash(instance: InstanceDto, token?: string) {
    const options = this.configService.get<Auth>('AUTHENTICATION');

    this.logger.verbose('generating hash ' + options.TYPE + ' to instance: ' + instance.instanceName);

    return (await this[options.TYPE](instance, token)) as { jwt: string } | { apikey: string };
  }

  /**
   * Refreshes a JWT token based on an old JWT token.
   * @param oldToken An old JWT token to refresh.
   * @returns An object containing the refreshed JWT token and instanceName.
   * @throws BadRequestException if the oldToken is invalid or an error occurs during token refresh.
   */
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
