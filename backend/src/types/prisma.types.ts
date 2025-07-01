import { PrismaClient } from '@prisma/client';

/**
 * Type for the transactional Prisma client used inside $transaction calls.
 * This is the client passed to the callback function in prisma.$transaction(async (tx) => ...)
 */
export type TransactionPrismaClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;