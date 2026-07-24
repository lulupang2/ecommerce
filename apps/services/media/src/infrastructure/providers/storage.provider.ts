import { Injectable } from '@nestjs/common';
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageProvider {
  private readonly bucket = process.env.S3_BUCKET || 'techzone-media';
  private readonly endpoint = process.env.S3_ENDPOINT || '';
  private readonly client = this.endpoint
    ? new S3Client({
        endpoint: this.endpoint,
        region: process.env.S3_REGION || 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
          secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
        },
      })
    : null;

  async initialize(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(name)) throw error;
    }
  }

  async uploadTarget(objectKey: string, contentType: string): Promise<{
    uploadUrl: string;
    publicUrl: string;
    storage: 's3' | 'mock';
  }> {
    const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || this.endpoint;
    if (!this.client) {
      const publicUrl = `${publicEndpoint || 'https://storage.example.invalid'}/${this.bucket}/${objectKey}`;
      return { uploadUrl: publicUrl, publicUrl, storage: 'mock' };
    }
    let uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType }),
      { expiresIn: 900 },
    );
    if (publicEndpoint && this.endpoint && publicEndpoint !== this.endpoint) {
      uploadUrl = uploadUrl.replace(this.endpoint, publicEndpoint);
    }
    return {
      uploadUrl,
      publicUrl: `${publicEndpoint}/${this.bucket}/${objectKey}`,
      storage: 's3',
    };
  }
}
