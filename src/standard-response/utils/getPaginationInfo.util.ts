import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationParams } from '../decorators/standard-param.decorator';
import { PaginationInfoDto } from '../dto/pagination-info.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginatedResponseOptions } from '../interfaces/paginated-response-options.interface';
import { RESPONSE_PAGINATION_INFO_KEY } from '../standard-response.constants';

/**
 * Combines the validated input from the request query params and the default options set
 * in the StandardResponse's decorators into a single a object to be injected as a param
 * into the request's handler method.
 */
export async function getPaginationInfo(
  ctx: ExecutionContext,
): Promise<PaginationParams> {
  const handler = ctx.getHandler();

  const paginationInfo = await validatePaginationQuery(ctx);

  Reflect.defineMetadata(RESPONSE_PAGINATION_INFO_KEY, paginationInfo, handler);

  const pagination: PaginationParams = {
    paginationInfo: paginationInfo,
    setPaginationInfo: function (metadata) {
      const currentMetadata = Reflect.getMetadata(
        RESPONSE_PAGINATION_INFO_KEY,
        handler,
      );
      const newMetadata = {
        ...currentMetadata,
        ...metadata,
      };
      Reflect.defineMetadata(
        RESPONSE_PAGINATION_INFO_KEY,
        newMetadata,
        handler,
      );
    },
  };
  return pagination;
}

export async function validatePaginationQuery(
  ctx: ExecutionContext,
): Promise<PaginationInfoDto> {
  const request = ctx.switchToHttp().getRequest();

  const paginationOptions: PaginatedResponseOptions = Reflect.getMetadata(
    RESPONSE_PAGINATION_INFO_KEY,
    ctx.getHandler(),
  );

  const queryData = {
    limit: parseInt(request.query.limit),
    offset: parseInt(request.query.offset),
  };

  if (isNaN(queryData.offset)) {
    queryData.offset = 0;
  }

  if (isNaN(queryData.limit)) {
    queryData.limit = paginationOptions?.defaultPageSize || 10;
  }

  const paginationQuery = plainToInstance(PaginationQueryDto, queryData);
  const errors = await validate(paginationQuery);
  if (errors.length > 0) {
    throw new BadRequestException(
      errors.map((error) => {
        return {
          field: error.property,
          error: Object.values(error.constraints).join(', '),
        };
      }),
    );
  }

  const paginationInfo = new PaginationInfoDto(paginationOptions);
  const limitQueryExists = typeof request.query.limit !== 'undefined';
  const offsetQueryExists = typeof request.query.offset !== 'undefined';

  paginationInfo.query = '';
  if (limitQueryExists) {
    paginationInfo.query += `limit=${request.query.limit}`;
    paginationInfo.limit = paginationQuery.limit;
  }
  if (offsetQueryExists) {
    if (limitQueryExists) paginationInfo.query += '&';
    paginationInfo.query += `offset=${request.query.offset}`;
    paginationInfo.offset = paginationQuery.offset;
  }

  if (
    paginationOptions?.minPageSize &&
    paginationQuery.limit < paginationOptions.minPageSize
  ) {
    throw new BadRequestException({
      field: 'limit',
      error: `limit can't be smaller than ${paginationOptions.minPageSize}`,
    });
  }

  if (
    paginationOptions?.maxPageSize &&
    paginationQuery.limit > paginationOptions.maxPageSize
  ) {
    throw new BadRequestException({
      field: 'limit',
      error: `limit can't be larger than ${paginationOptions.maxPageSize}`,
    });
  }

  return paginationInfo;
}
