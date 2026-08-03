import { Module } from '@nestjs/common';
import { CertificatesController } from './controllers/certificates.controller';
import { CouponsController } from './controllers/coupons.controller';
import { DiscountsController } from './controllers/discounts.controller';
import { HappyHoursController } from './controllers/happy-hours.controller';
import { PromotionsService } from './services/promotions.service';
import { CertificatePromotionsService } from './services/certificate-promotions.service';
import { CommercialPromotionsService } from './services/commercial-promotions.service';
import { CouponPromotionsService } from './services/coupon-promotions.service';
import { CERTIFICATE_PROMOTIONS_REPOSITORY } from './interfaces/certificate-promotions.repository';
import { COUPON_PROMOTIONS_REPOSITORY } from './interfaces/coupon-promotions.repository';
import { DISCOUNT_PROMOTIONS_REPOSITORY } from './interfaces/discount-promotions.repository';
import { HAPPY_HOUR_PROMOTIONS_REPOSITORY } from './interfaces/happy-hour-promotions.repository';
import { PrismaCertificatePromotionsRepository } from './repositories/prisma-certificate-promotions.repository';
import { PrismaCouponPromotionsRepository } from './repositories/prisma-coupon-promotions.repository';
import { PrismaDiscountPromotionsRepository } from './repositories/prisma-discount-promotions.repository';
import { PrismaHappyHourPromotionsRepository } from './repositories/prisma-happy-hour-promotions.repository';

@Module({
  controllers: [
    HappyHoursController,
    DiscountsController,
    CouponsController,
    CertificatesController,
  ],
  providers: [
    PromotionsService,
    CommercialPromotionsService,
    CouponPromotionsService,
    CertificatePromotionsService,
    {
      provide: HAPPY_HOUR_PROMOTIONS_REPOSITORY,
      useClass: PrismaHappyHourPromotionsRepository,
    },
    {
      provide: DISCOUNT_PROMOTIONS_REPOSITORY,
      useClass: PrismaDiscountPromotionsRepository,
    },
    {
      provide: COUPON_PROMOTIONS_REPOSITORY,
      useClass: PrismaCouponPromotionsRepository,
    },
    {
      provide: CERTIFICATE_PROMOTIONS_REPOSITORY,
      useClass: PrismaCertificatePromotionsRepository,
    },
  ],
  exports: [
    PromotionsService,
    CouponPromotionsService,
    DISCOUNT_PROMOTIONS_REPOSITORY,
    HAPPY_HOUR_PROMOTIONS_REPOSITORY,
  ],
})
export class PromotionsModule {}
