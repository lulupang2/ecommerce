const {
  IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength,
} = require('class-validator');

function field(decorators, target, name) {
  for (const decorator of decorators) decorator(target.prototype, name);
}

class RegisterDto {}
field([IsEmail(), MaxLength(320)], RegisterDto, 'email');
field([IsString(), MinLength(8), MaxLength(128)], RegisterDto, 'password');
field([IsString(), IsNotEmpty(), MaxLength(100)], RegisterDto, 'name');
field([IsOptional(), IsString(), MaxLength(30)], RegisterDto, 'phone');

class LoginDto {}
field([IsEmail(), MaxLength(320)], LoginDto, 'email');
field([IsString(), MinLength(1), MaxLength(128)], LoginDto, 'password');

class RefreshDto {}
field([IsOptional(), IsString(), MaxLength(512)], RefreshDto, 'refreshToken');

class PaymentConfirmDto {}
field([IsOptional(), IsString(), MaxLength(200)], PaymentConfirmDto, 'paymentKey');
field([IsUUID()], PaymentConfirmDto, 'orderId');
field([IsInt(), Min(0)], PaymentConfirmDto, 'amount');
field([IsOptional()], PaymentConfirmDto, 'order');
field([IsOptional(), IsIn(['card', 'kakaopay', 'naverpay', 'bank'])], PaymentConfirmDto, 'provider');
field([IsOptional(), IsIn(['card', 'kakaopay', 'naverpay', 'bank'])], PaymentConfirmDto, 'method');

class RefundDto {}
field([IsInt(), Min(1)], RefundDto, 'amount');
field([IsString(), IsNotEmpty(), MaxLength(500)], RefundDto, 'reason');

class InventoryAdjustmentDto {}
field([IsInt(), Min(0)], InventoryAdjustmentDto, 'availableQty');
field([IsOptional(), IsUUID()], InventoryAdjustmentDto, 'warehouseId');
field([IsString(), IsNotEmpty(), MaxLength(500)], InventoryAdjustmentDto, 'reason');

class GuestAccessDto {}
field([IsString(), IsNotEmpty(), MaxLength(40)], GuestAccessDto, 'orderNumber');
field([IsString(), IsNotEmpty(), MaxLength(30)], GuestAccessDto, 'phone');

class PaginationDto {}
field([IsOptional(), IsInt(), Min(1)], PaginationDto, 'page');
field([IsOptional(), IsInt(), Min(1), Max(100)], PaginationDto, 'pageSize');
field([IsOptional(), IsString(), MaxLength(100)], PaginationDto, 'sort');
field([IsOptional(), IsIn(['asc', 'desc'])], PaginationDto, 'direction');
field([IsOptional(), IsString(), MaxLength(200)], PaginationDto, 'search');

module.exports = {
  GuestAccessDto,
  InventoryAdjustmentDto,
  LoginDto,
  PaginationDto,
  PaymentConfirmDto,
  RefreshDto,
  RefundDto,
  RegisterDto,
};
