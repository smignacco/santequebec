UPDATE "Organization"
SET
  "orgCode" = mapping.org_code,
  "loginPin" = mapping.login_pin
FROM (
  VALUES
    ('Santé Québec', '00_SANTEQUEBEC', '8s3whsquh'),
    ('CISSS du Bas-Saint-Laurent', '01_CISSS_du_Bas-Saint-Laurent', 'qs8bcps4w'),
    ('CIUSSS du Saguenay−Lac-Saint-Jean', '02_CIUSSS_du_Saguenay−Lac-Saint-Jean', 'c257j7ry6'),
    ('CHU de Quebec', '03_CHU_de_Quebec', 'kubigqt2r'),
    ('CIUSSS de la Capitale-Nationale', '03_CIUSSS_de_la_Capitale-Nationale', 'dzkokzlve'),
    ('CIUSSS de la Mauricie-et-du-Centre-du-Quebec', '04_CIUSSS_de_la_Mauricie-et-du-Centre-du-Quebec', '1ijzzw7yo'),
    ('CIUSSS de l''Estrie', '05_CIUSSS_de_Estrie', 'rq3yq5cg1'),
    ('CHU Sainte-Justine', '06_CHU_Sainte-Justine', '7xdipdiax'),
    ('CHUM', '06_CHUM', '9gf4rj0pt'),
    ('CIUSSS de l''Est-de-l''lle-de-Montreal', '06_CIUSSS_de_Est-de-lle-de-Montreal', 'adrucdn3x'),
    ('CIUSSS du Nord-de-l''lle-de-Montreal', '06_CIUSSS_du_Nord-de-lle-de-Montreal', 'wnadph9o9'),
    ('CIUSSS du Centre-Ouest-de-l''lle-de-Montreal', '06_CIUSSS_du_Centre-Ouest-de-lle-de-Montreal', 'oxtr9i981'),
    ('CIUSSS du Centre-Sud-de-l''lle-de-Montreal', '06_CIUSSS_du_Centre-Sud-de-lle-de-Montreal', 'girzayov2'),
    ('CIUSSS de l''Ouest-de-l''lle-de-Montreal', '06_CIUSSS_Ouest-de-lle-de-Montreal', '2rt3tkhae'),
    ('CUSM', '06_CUSM', 'ojotsgc6i'),
    ('Institut de cardiologie de Montréal', '06_ICM', '3pajyn38e'),
    ('CISSS de l''Abitibi-Temiscamingue', '08_CISSS_de_Abitibi-Temiscamingue', 'lnfssenob'),
    ('CISSS de la Cote-Nord', '09_CISSS_de_la_Cote-Nord', 'sbcgnst41'),
    ('CRSSS de la Baie-James', '10_CRSSS_de_la_Baie-James', 't3mdhr2m0'),
    ('CISSS de la Gaspesie', '11_CISSS_de_la_Gaspesie', 'nenceg7pa'),
    ('CISSS des lles', '11_CISSS_des_lles', 'ra0qxxmea'),
    ('CISSS de Chaudiere-Appalaches', '12_CISSS_de_Chaudiere-Appalaches', '1632cf5rx'),
    ('CISSS de Laval (DRILLL)', '13_CISSS_de_Laval_DRILLL', 'xko10fgvi'),
    ('CISSS de Lanaudiere (DRILLL)', '14_CISSS_de_Lanaudiere_DRILLL', '8uc8qjivo'),
    ('CISSS des Laurentides (DRILLL)', '15_CISSS_des_Laurentides_DRILLL', '1qh1h0jne'),
    ('CISSS de la Monteregie-Centre (DRIM)', '16_CISSS_de_la_Monteregie-Centre_DRIM', 'frxbvl4zv'),
    ('CISSS de la Monteregie-Est (DRIM)', '16_CISSS_de_la_Monteregie-Est_DRIM', '3chb7y8mn'),
    ('CISSS de la Monteregie-Ouest (DRIM)', '16_CISSS_de_la_Monteregie-Ouest_DRIM', 'r3j5cqntq')
) AS mapping(display_name, org_code, login_pin)
WHERE "Organization"."displayName" = mapping.display_name
   OR "Organization"."orgCode" = mapping.org_code;
