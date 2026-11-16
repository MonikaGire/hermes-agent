import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user
  const passwordHash = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@hermes.ai' },
    update: {},
    create: {
      name: 'HERMES Admin',
      email: 'admin@hermes.ai',
      passwordHash,
      role: 'ADMIN',
    },
  });
  console.log('Created admin user:', admin.email);

  // Default integrations
  const integrations = [
    { provider: 'openai', isActive: false, config: {} },
    { provider: 'apollo', isActive: false, config: {} },
    { provider: 'hunter', isActive: false, config: {} },
    { provider: 'serpapi', isActive: false, config: {} },
    { provider: 'clearbit', isActive: false, config: {} },
    { provider: 'smtp', isActive: false, config: {} },
    { provider: 'telegram', isActive: false, config: {} },
  ];

  for (const integration of integrations) {
    await prisma.integration.upsert({
      where: { provider: integration.provider },
      update: {},
      create: integration,
    });
  }
  console.log('Created default integrations');

  // Default settings
  const settings = [
    { key: 'targetIndustries', value: ['Electronics', 'Packaging', 'Plastics', 'Medical devices', 'Chemicals', 'Machinery', 'Food manufacturing'] },
    { key: 'targetCountries', value: ['USA', 'UK', 'Australia', 'Singapore'] },
    { key: 'companySizeMin', value: 20 },
    { key: 'companySizeMax', value: 500 },
    { key: 'emailWordMin', value: 80 },
    { key: 'emailWordMax', value: 180 },
    { key: 'reviewScoreThreshold', value: 8 },
    { key: 'autoApprove', value: false },
    { key: 'emailProvider', value: 'smtp' },
    { key: 'openaiModel', value: 'gpt-4o' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as unknown as import('@prisma/client').Prisma.InputJsonValue },
    });
  }
  console.log('Created default settings');

  // Sample company for development
  if (process.env['NODE_ENV'] === 'development') {
    const existing = await prisma.company.findFirst({ where: { name: 'Apex Electronics Ltd' } });
    if (!existing) {
      const company = await prisma.company.create({
        data: {
          name: 'Apex Electronics Ltd',
          website: 'https://apexelectronics.example.com',
          industry: 'Electronics',
          country: 'USA',
          employeeCount: 120,
          revenueEstimate: '$15M-$30M',
          status: 'NEW',
          source: 'manual',
        },
      });
      console.log('Created sample company:', company.name);
    }
  }

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
