import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import {
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { BuildHandler, BuildHandlerArguments } from '@smithy/types';

@Injectable()
export class StorageProvider {
  private readonly bucket = process.env.S3_BUCKET || 'techzone-media';
  private readonly endpoint = (process.env.S3_ENDPOINT || '').replace(/\/$/, '');
  private readonly publicEndpoint = (process.env.S3_PUBLIC_ENDPOINT || this.endpoint).replace(/\/$/, '');
  private readonly client = this.endpoint ? this.createClient(this.endpoint) : null;
  private readonly signingClient = this.client && this.publicEndpoint && this.publicEndpoint !== this.endpoint
    ? this.createClient(this.publicEndpoint)
    : this.client;

  private createClient(endpoint: string): S3Client {
    return new S3Client({
      endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
      },
    });
  }

  private withS3CompatibleChecksum<T extends PutBucketCorsCommand | PutBucketPolicyCommand>(command: T): T {
    command.middlewareStack.addRelativeTo(
      (next: BuildHandler<any, any>) => async (args: BuildHandlerArguments<any>) => {
        const request = args.request as {
          body?: string | Uint8Array;
          headers: Record<string, string>;
        };
        for (const header of Object.keys(request.headers)) {
          if (header === 'x-amz-sdk-checksum-algorithm' || header.startsWith('x-amz-checksum-')) {
            delete request.headers[header];
          }
        }
        if (request.body !== undefined) {
          request.headers['content-md5'] = crypto
            .createHash('md5')
            .update(typeof request.body === 'string' ? request.body : Buffer.from(request.body))
            .digest('base64');
        }
        return next(args);
      },
      {
        relation: 'after',
        toMiddleware: 'flexibleChecksumsMiddleware',
        name: 's3CompatibleContentMd5',
      },
    );
    return command;
  }

  async initialize(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(name)) throw error;
    }
    await this.client.send(this.withS3CompatibleChecksum(new PutBucketPolicyCommand({
      Bucket: this.bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Sid: 'PublicProductMediaRead',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        }],
      }),
    })));
    await this.client.send(this.withS3CompatibleChecksum(new PutBucketCorsCommand({
      Bucket: this.bucket,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD', 'PUT'],
          AllowedOrigins: (process.env.CORS_ORIGIN || 'http://localhost:15173')
            .split(',')
            .map(origin => origin.trim())
            .filter(Boolean),
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        }],
      },
    })));
  }

  async uploadTarget(objectKey: string, contentType: string): Promise<{
    uploadUrl: string;
    publicUrl: string;
    storage: 's3' | 'mock';
  }> {
    if (!this.client) {
      const publicUrl = `${this.publicEndpoint || 'https://storage.example.invalid'}/${this.bucket}/${objectKey}`;
      return { uploadUrl: publicUrl, publicUrl, storage: 'mock' };
    }
    const uploadUrl = await getSignedUrl(
      this.signingClient!,
      new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType }),
      { expiresIn: 900 },
    );
    return {
      uploadUrl,
      publicUrl: `${this.publicEndpoint}/${this.bucket}/${objectKey}`,
      storage: 's3',
    };
  }
}
