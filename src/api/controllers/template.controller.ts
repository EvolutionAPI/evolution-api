import { InstanceDto } from '../dto/instance.dto';
import { TemplateDto } from '../dto/template.dto';
import { TemplateService } from '../services/template.service';

export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  public async createTemplate(instance: InstanceDto, data: TemplateDto) {
    return this.templateService.create(instance, data);
  }

  public async findTemplate(instance: InstanceDto) {
    return this.templateService.find(instance);
  }
}
