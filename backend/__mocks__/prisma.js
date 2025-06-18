const { mockDeep } = require('jest-mock-extended');
const { PrismaClient } = require('@prisma/client');

const prismaMock = mockDeep();

module.exports = {
  __esModule: true,
  prisma: prismaMock,
};