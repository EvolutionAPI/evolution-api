import { InstanceDto } from '@api/dto/instance.dto';
import { MediaDto } from '@api/integrations/s3/dto/media.dto';
import { S3Service } from '@api/integrations/s3/services/s3.service';

export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}

  public async getMedia(instance: InstanceDto, data: MediaDto) {
    return this.s3Service.getMedia(instance, data);
  }

  public async getMediaUrl(instance: InstanceDto, data: MediaDto) {
    return this.s3Service.getMediaUrl(instance, data);
  }
}
