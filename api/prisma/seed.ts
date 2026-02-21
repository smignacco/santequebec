import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const typeCodes = ['CISSS', 'CIUSSS', 'CHU', 'CHUM', 'CUSM', 'ICM', 'CRSSS', 'SANTE_QUEBEC'];

const organizations = [
  ['06', 'CIUSSS', "CIUSSS du Centre-Sud-de-l'Île-de-Montréal"],
  ['06', 'CIUSSS', "CIUSSS du Centre-Ouest-de-l'Île-de-Montréal"],
  ['02', 'CIUSSS', 'CIUSSS du Saguenay'],
  ['05', 'CIUSSS', "CIUSSS de l'Estrie"],
  ['16', 'CISSS', 'CISSS de la Montérégie-Centre'],
  ['04', 'CIUSSS', 'CIUSSS de la Mauricie-et-du-Centre-du-Québec'],
  ['06', 'CIUSSS', "CIUSSS du Nord-de-l'Île-de-Montréal"],
  ['03', 'CHU', 'CHU de Québec'],
  ['13', 'CISSS', 'CISSS de Laval (DRILLL)'],
  ['01', 'CISSS', 'CISSS du Bas-Saint-Laurent'],
  ['06', 'CHU', 'CHU Sainte-Justine'],
  ['06', 'CHUM', 'CHUM'],
  ['03', 'CIUSSS', 'CIUSSS de la Capitale-Nationale'],
  ['06', 'CIUSSS', "CIUSSS de l'Ouest-de-l'Île-de-Montréal"],
  ['06', 'CIUSSS', "CIUSSS de l'Est-de-l'Île-de-Montréal"],
  ['16', 'CISSS', 'CISSS de la Montérégie-Ouest'],
  ['16', 'CISSS', 'CISSS de la Montérégie-Est'],
  ['06', 'ICM', 'ICM'],
  ['12', 'CISSS', 'CISSS de Chaudière-Appalaches'],
  ['08', 'CISSS', "CISSS de l'Abitibi-Témiscamingue"],
  ['09', 'CISSS', 'CISSS de la Côte-Nord'],
  ['11', 'CISSS', 'CISSS de la Gaspésie'],
  ['06', 'CUSM', 'CUSM'],
  ['14', 'CISSS', 'CISSS de Lanaudière (DRILLL)'],
  ['15', 'CISSS', 'CISSS des Laurentides (DRILLL)'],
  ['00', 'SANTE_QUEBEC', 'Santé Québec'],
  ['10', 'CRSSS', 'CRSSS de la Baie-James'],
  ['11', 'CISSS', 'CISSS des Îles']
] as const;

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, '').toUpperCase();
const shortName = (name: string) => normalize(name)
  .replace(/\b(CIUSSS|CISSS|CHU|CHUM|CUSM|ICM|CRSSS|SANTE QUEBEC|SANTE|QUEBEC|DE|DU|DES|LA|LE|L|ET)\b/g, ' ')
  .replace(/[^A-Z0-9]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 24);

async function main() {
  for (const code of typeCodes) {
    await prisma.organizationType.upsert({ where: { code }, update: { label: code }, create: { code, label: code } });
  }

  const dedupe = new Map<string, { regionCode: string; typeCode: string; displayName: string }>();
  for (const [regionCode, typeCode, rawDisplay] of organizations) {
    const isDrill = rawDisplay.includes('(DRILLL)');
    const displayName = rawDisplay.replace('(DRILLL)', '').trim();
    const orgCode = regionCode === '00' && typeCode === 'SANTE_QUEBEC' ? '00-SANTE_QUEBEC' : `${regionCode}-${typeCode}-${shortName(displayName)}`;
    dedupe.set(orgCode, { regionCode, typeCode, displayName });
    const type = await prisma.organizationType.findUniqueOrThrow({ where: { code: typeCode } });
    await prisma.organization.upsert({
      where: { orgCode },
      update: { regionCode, displayName, isDrill, organizationTypeId: type.id, isActive: true },
      create: { orgCode, regionCode, displayName, isDrill, organizationTypeId: type.id, isActive: true }
    });
  }

  console.log(`Seeded ${typeCodes.length} types and ${dedupe.size} organizations`);
}

main().finally(async () => prisma.$disconnect());
