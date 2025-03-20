export class LabelDto {
  id?: string;
  name: string;
  color: string;
  predefinedId?: string;
}

export class HandleLabelDto {
  number: string;
  labelId: string;
  action: 'add' | 'remove';
}
