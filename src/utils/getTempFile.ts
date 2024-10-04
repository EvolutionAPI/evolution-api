import * as s3Service from '@api/integrations/storage/s3/libs/minio.server';
import mime from 'mime-types';

export const getTempFile = async (file: any, instanceId: string): Promise<string> => {
  const fileName = file.originalname;
  const mimetype = mime.lookup(fileName) || 'application/octet-stream';
  const folder = `${process.env.S3_BUCKET}/${instanceId}/temp`;
  const fileUrl = `https://${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${folder}/${fileName}`;

  if (!process.env.S3_ENABLED || process.env.S3_ENABLED !== 'true') {
    return file.buffer.toString('base64');
  }

  try {
    if (file.buffer) {
      await s3Service.uploadTempFile(folder, fileName, file.buffer, file.size, {
        'Content-Type': mimetype,
      });
    }
  } catch (error) {
    console.error(`Erro ao fazer upload do arquivo ${fileName}:`, error);
  }

  return fileUrl;
};

export const deleteTempFile = async (file: any, instanceId: string): Promise<void> => {
  if (!process.env.S3_ENABLED) return;

  const fileName = file.originalname;
  const folder = `${process.env.S3_BUCKET}/${instanceId}/temp`;

  await s3Service.deleteFile(folder, fileName);
};
