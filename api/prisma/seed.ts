import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const typeCodes = ['CISSS', 'CIUSSS', 'CHU', 'CHUM', 'CUSM', 'ICM', 'CRSSS', 'SANTE_QUEBEC'];

const organizations = [
  { regionCode: '00', typeCode: 'SANTE_QUEBEC', displayName: 'Santé Québec', orgCode: '00_SANTEQUEBEC', loginPin: '8s3whsquh' },
  { regionCode: '01', typeCode: 'CISSS', displayName: 'CISSS du Bas-Saint-Laurent', orgCode: '01_CISSS_du_Bas-Saint-Laurent', loginPin: 'qs8bcps4w' },
  { regionCode: '02', typeCode: 'CIUSSS', displayName: 'CIUSSS du Saguenay−Lac-Saint-Jean', orgCode: '02_CIUSSS_du_Saguenay−Lac-Saint-Jean', loginPin: 'c257j7ry6' },
  { regionCode: '03', typeCode: 'CHU', displayName: 'CHU de Quebec', orgCode: '03_CHU_de_Quebec', loginPin: 'kubigqt2r' },
  { regionCode: '03', typeCode: 'CIUSSS', displayName: 'CIUSSS de la Capitale-Nationale', orgCode: '03_CIUSSS_de_la_Capitale-Nationale', loginPin: 'dzkokzlve' },
  { regionCode: '04', typeCode: 'CIUSSS', displayName: 'CIUSSS de la Mauricie-et-du-Centre-du-Quebec', orgCode: '04_CIUSSS_de_la_Mauricie-et-du-Centre-du-Quebec', loginPin: '1ijzzw7yo' },
  { regionCode: '05', typeCode: 'CIUSSS', displayName: "CIUSSS de l'Estrie", orgCode: '05_CIUSSS_de_Estrie', loginPin: 'rq3yq5cg1' },
  { regionCode: '06', typeCode: 'CHU', displayName: 'CHU Sainte-Justine', orgCode: '06_CHU_Sainte-Justine', loginPin: '7xdipdiax' },
  { regionCode: '06', typeCode: 'CHUM', displayName: 'CHUM', orgCode: '06_CHUM', loginPin: '9gf4rj0pt' },
  { regionCode: '06', typeCode: 'CIUSSS', displayName: "CIUSSS de l'Est-de-l'lle-de-Montreal", orgCode: '06_CIUSSS_de_Est-de-lle-de-Montreal', loginPin: 'adrucdn3x' },
  { regionCode: '06', typeCode: 'CIUSSS', displayName: "CIUSSS du Nord-de-l'lle-de-Montreal", orgCode: '06_CIUSSS_du_Nord-de-lle-de-Montreal', loginPin: 'wnadph9o9' },
  { regionCode: '06', typeCode: 'CIUSSS', displayName: "CIUSSS du Centre-Ouest-de-l'lle-de-Montreal", orgCode: '06_CIUSSS_du_Centre-Ouest-de-lle-de-Montreal', loginPin: 'oxtr9i981' },
  { regionCode: '06', typeCode: 'CIUSSS', displayName: "CIUSSS du Centre-Sud-de-l'lle-de-Montreal", orgCode: '06_CIUSSS_du_Centre-Sud-de-lle-de-Montreal', loginPin: 'girzayov2' },
  { regionCode: '06', typeCode: 'CIUSSS', displayName: "CIUSSS de l'Ouest-de-l'lle-de-Montreal", orgCode: '06_CIUSSS_Ouest-de-lle-de-Montreal', loginPin: '2rt3tkhae' },
  { regionCode: '06', typeCode: 'CUSM', displayName: 'CUSM', orgCode: '06_CUSM', loginPin: 'ojotsgc6i' },
  { regionCode: '06', typeCode: 'ICM', displayName: 'Institut de cardiologie de Montréal', orgCode: '06_ICM', loginPin: '3pajyn38e' },
  { regionCode: '08', typeCode: 'CISSS', displayName: "CISSS de l'Abitibi-Temiscamingue", orgCode: '08_CISSS_de_Abitibi-Temiscamingue', loginPin: 'lnfssenob' },
  { regionCode: '09', typeCode: 'CISSS', displayName: 'CISSS de la Cote-Nord', orgCode: '09_CISSS_de_la_Cote-Nord', loginPin: 'sbcgnst41' },
  { regionCode: '10', typeCode: 'CRSSS', displayName: 'CRSSS de la Baie-James', orgCode: '10_CRSSS_de_la_Baie-James', loginPin: 't3mdhr2m0' },
  { regionCode: '11', typeCode: 'CISSS', displayName: 'CISSS de la Gaspesie', orgCode: '11_CISSS_de_la_Gaspesie', loginPin: 'nenceg7pa' },
  { regionCode: '11', typeCode: 'CISSS', displayName: 'CISSS des lles', orgCode: '11_CISSS_des_lles', loginPin: 'ra0qxxmea' },
  { regionCode: '12', typeCode: 'CISSS', displayName: 'CISSS de Chaudiere-Appalaches', orgCode: '12_CISSS_de_Chaudiere-Appalaches', loginPin: '1632cf5rx' },
  { regionCode: '13', typeCode: 'CISSS', displayName: 'CISSS de Laval (DRILLL)', orgCode: '13_CISSS_de_Laval_DRILLL', loginPin: 'xko10fgvi', isDrill: true },
  { regionCode: '14', typeCode: 'CISSS', displayName: 'CISSS de Lanaudiere (DRILLL)', orgCode: '14_CISSS_de_Lanaudiere_DRILLL', loginPin: '8uc8qjivo', isDrill: true },
  { regionCode: '15', typeCode: 'CISSS', displayName: 'CISSS des Laurentides (DRILLL)', orgCode: '15_CISSS_des_Laurentides_DRILLL', loginPin: '1qh1h0jne', isDrill: true },
  { regionCode: '16', typeCode: 'CISSS', displayName: 'CISSS de la Monteregie-Centre (DRIM)', orgCode: '16_CISSS_de_la_Monteregie-Centre_DRIM', loginPin: 'frxbvl4zv', isDrill: true },
  { regionCode: '16', typeCode: 'CISSS', displayName: 'CISSS de la Monteregie-Est (DRIM)', orgCode: '16_CISSS_de_la_Monteregie-Est_DRIM', loginPin: '3chb7y8mn', isDrill: true },
  { regionCode: '16', typeCode: 'CISSS', displayName: 'CISSS de la Monteregie-Ouest (DRIM)', orgCode: '16_CISSS_de_la_Monteregie-Ouest_DRIM', loginPin: 'r3j5cqntq', isDrill: true }
] as const;

async function main() {
  for (const code of typeCodes) {
    await prisma.organizationType.upsert({ where: { code }, update: { label: code }, create: { code, label: code } });
  }

  for (const org of organizations) {
    const type = await prisma.organizationType.findUniqueOrThrow({ where: { code: org.typeCode } });
    await prisma.organization.upsert({
      where: { orgCode: org.orgCode },
      update: {
        regionCode: org.regionCode,
        displayName: org.displayName,
        isDrill: Boolean(org.isDrill),
        organizationTypeId: type.id,
        isActive: true,
        loginPin: org.loginPin
      },
      create: {
        orgCode: org.orgCode,
        regionCode: org.regionCode,
        displayName: org.displayName,
        isDrill: Boolean(org.isDrill),
        organizationTypeId: type.id,
        isActive: true,
        loginPin: org.loginPin
      }
    });
  }

  console.log(`Seeded ${typeCodes.length} types and ${organizations.length} organizations`);
}

main().finally(async () => prisma.$disconnect());
