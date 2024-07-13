import { Logger } from '../../../../config/logger.config';
import { BadRequestException } from '../../../../exceptions';
import { InstanceDto } from '../../../dto/instance.dto';
import { PrismaRepository } from '../../../repository/repository.service';
import { MediaDto } from '../dto/media.dto';
import { getObjectUrl } from '../libs/minio.server';

export class S3Service {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  private readonly logger = new Logger(S3Service.name);

  public async getMedia(instance: InstanceDto, query?: MediaDto) {
    try {
      const where: any = {
        instanceId: instance.instanceId,
        ...query,
      };

      const media = await this.prismaRepository.media.findMany({
        where,
        select: {
          id: true,
          fileName: true,
          type: true,
          mimetype: true,
          createdAt: true,
          Message: true,
        },
      });

      if (!media || media.length === 0) {
        throw 'Media not found';
      }

      return media;
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  public async getMediaUrl(instance: InstanceDto, data: MediaDto) {
    const media = (await this.getMedia(instance, { id: data.id }))[0];
    const mediaUrl = await getObjectUrl(media.fileName, data.expiry);
    return {
      mediaUrl,
      ...media,
    };
  }
}
