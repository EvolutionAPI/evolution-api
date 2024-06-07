import { BadRequestException } from '../../exceptions';
import { PrismaRepository } from '../repository/repository.service';

export class AuthService {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  public async checkDuplicateToken(token: string) {
    const instances = await this.prismaRepository.instance.findMany({
      where: { token },
    });

    if (instances.length > 0) {
      throw new BadRequestException('Token already exists');
    }

    return true;
  }
}
