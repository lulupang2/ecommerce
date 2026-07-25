import {
  IsIn, IsInt, IsNotEmpty, IsNumberString, IsObject, IsOptional, IsString,
  Matches, Max, MaxLength, Min,
} from 'class-validator';
import {
  PRODUCT_LIST_SORTS,
  ProductListQuery,
} from '../domain/product-list-query';

export class ProductListQueryDto implements ProductListQuery {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) minPrice?: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) maxPrice?: string;
  @IsOptional() @IsIn(['true', 'false']) inStock?: string;
  @IsOptional() @IsIn(['true', 'false']) discounted?: string;
  @IsOptional() @IsIn(PRODUCT_LIST_SORTS) sort?: ProductListQuery['sort'];
  @IsOptional() @Matches(/^[1-9]\d*$/) page?: string;
  @IsOptional() @Matches(/^(?:[1-9]|[1-3]\d|4[0-8])$/) pageSize?: string;
  @IsOptional() @IsIn(['all']) status?: string;
}

export class ReviewCreateDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @IsNotEmpty() @MaxLength(3000) body!: string;
}

export class QuestionCreateDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(3000) body!: string;
}

export class SectionCreateDto {
  @IsString() @IsNotEmpty() type!: string;
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsString() @IsNotEmpty() slug!: string;
  @IsOptional() @IsIn(['draft', 'published', 'hidden']) status?: string;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class SectionUpdateDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsIn(['draft', 'published', 'hidden']) status?: string;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class ProductCreateDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() brand!: string;
  @IsString() @IsNotEmpty() category!: string;
  @IsInt() @Min(0) price!: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsIn(['draft', 'published', 'hidden', 'archived']) status?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() modelNumber?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsObject() optionValues?: Record<string, string>;
  @IsOptional() @IsInt() @Min(0) listPrice?: number;
  @IsOptional() @IsInt() @Min(0) costPrice?: number;
  @IsOptional() @IsInt() @Min(0) weightGram?: number;
}

export class ProductUpdateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsIn(['draft', 'published', 'hidden', 'archived']) status?: string;
}

export class ReviewStatusDto {
  @IsIn(['pending', 'published', 'hidden', 'rejected']) status!: string;
}
