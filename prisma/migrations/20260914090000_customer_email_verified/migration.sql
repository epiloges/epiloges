-- Email ownership. Every account that exists today is grandfathered in: they have been
-- receiving order mail at this address for as long as they have had the account, and a
-- launch-day nag to "verify" would only cost trust. Null from here on means "not yet".
ALTER TABLE "customers" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "customers" SET "emailVerifiedAt" = "createdAt";
