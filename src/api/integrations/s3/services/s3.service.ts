import { InstanceDto } from '@api/dto/instance.dto';
import { MediaDto } from '@api/integrations/s3/dto/media.dto';
import { getObjectUrl } from '@api/integrations/s3/libs/minio.server';
import { PrismaRepository } from '@api/repository/repository.service';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';

export class S3Service {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  private readonly logger = new Logger('S3Service');

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
